//! Chronicle Link — P2P table sync over TCP (pure `std::net`, no crates, no servers).
//!
//! Идея: партия и так живёт в EML-свитках — значит, сетевой слой это просто
//! обмен свитками и пакетами хода между столами. Топология — звезда:
//! один стол хостит (`link host`), игроки подключаются (`link join`).
//!
//! Протокол: TCP, кадр = 4 байта big-endian длины + UTF-8 JSON.
//! Порядок фаз честного раунда (commit-reveal):
//!   1. каждый игрок рассылает `intent_commit` — sha256 своего интента и сида;
//!   2. после сбора коммитов все рассылают `intent_reveal` — сам интент и сид;
//!   3. коммиты проверяются против раскрытий — перекинуть дайс невозможно;
//!   4. любой стол резолвит раунд детерминированным WEGO-движком и рассылает
//!      `round_result` с чексуммой — все столы сверяют побайтово.
//!
//! Модуль не зависит от Tauri: `run_host`/`run_client` работают с каналами
//! `LinkEvent`, тонкий клей в lib.rs пересылает их в окно.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const PROTOCOL_VERSION: u32 = 1;

/// Верхний предел игроков за одним столом: на 13-м хост отвечает error-кадром.
pub const MAX_PEERS: usize = 12;

/// Раз в N секунд — ping, чтобы мёртвые соединения отваливались, а не висели.
pub const KEEPALIVE_SECS: u64 = 15;

/// IP хоста в локальной сети — чтобы игрокам можно было скопировать адрес.
/// UDP-«connect» пакетов не шлёт: только выбирает маршрут, как настоящий клиент.
fn local_lan_ip() -> Option<String> {
    let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    s.local_addr().ok().map(|a| a.ip().to_string())
}

// ------------------------------------------------------------------ protocol

/// Кадр = u32 big-endian длины + полезная нагрузка. Верхний предел 16 МБ —
/// свиток кампании помещается, а битый поток не съест память.
pub const MAX_FRAME: u32 = 16 * 1024 * 1024;

pub fn write_frame(stream: &mut TcpStream, payload: &[u8]) -> std::io::Result<()> {
    if payload.len() as u64 > MAX_FRAME as u64 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }
    stream.write_all(&(payload.len() as u32).to_be_bytes())?;
    stream.write_all(payload)?;
    stream.flush()
}

/// Читает один кадр; None — соединение закрыто чисто.
pub fn read_frame(reader: &mut BufReader<TcpStream>) -> std::io::Result<Option<Vec<u8>>> {
    let mut len_bytes = [0u8; 4];
    if reader.read_exact(&mut len_bytes).is_err() {
        return Ok(None);
    }
    let len = u32::from_be_bytes(len_bytes);
    if len > MAX_FRAME {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }
    let mut buf = vec![0u8; len as usize];
    reader.read_exact(&mut buf)?;
    Ok(Some(buf))
}

/// Конверт протокола: тип, автор, монотонный номер, тело (произвольный JSON).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Envelope {
    pub kind: String,
    pub from: String,
    pub seq: u64,
    #[serde(default)]
    pub body: serde_json::Value,
}

impl Envelope {
    pub fn new(kind: &str, from: &str, seq: u64, body: serde_json::Value) -> Self {
        Envelope {
            kind: kind.to_string(),
            from: from.to_string(),
            seq,
            body,
        }
    }

    pub fn to_frame(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(self).map_err(|e| format!("serialize: {e}"))
    }

    pub fn from_frame(bytes: &[u8]) -> Result<Envelope, String> {
        serde_json::from_slice(bytes).map_err(|e| format!("deserialize: {e}"))
    }
}

/// hello: кто подключается, какими актёрами играет, версия протокола.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Hello {
    pub name: String,
    pub actors: Vec<String>,
    pub proto: u32,
}

/// welcome: ответы хоста на hello — ростер, свиток кампании, коммит сида мастера.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Welcome {
    pub table: String,
    pub master_seed_commit: String,
    pub campaign_eml: Option<String>,
    pub players: Vec<PlayerInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlayerInfo {
    pub name: String,
    pub actors: Vec<String>,
    pub is_host: bool,
}

/// intent_commit: sha256(canonical intent json + dice seed) ДО раскрытия.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntentCommit {
    pub round: u64,
    pub commit: String,
}

/// intent_reveal: интент как есть + сид; коммит обязан сойтись.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntentReveal {
    pub round: u64,
    pub commit: String,
    pub intent: serde_json::Value,
    pub dice_seed: String,
}

/// round_result: канонический результат раунда; чексумма сверяется всеми.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoundResult {
    pub round: u64,
    pub checksum: String,
    pub state: serde_json::Value,
}

// ------------------------------------------------------------------ events

/// Всё, что сетевой слой сообщаетнаружу (в тесты — через канал, в UI — через Tauri).
#[derive(Debug, Clone, PartialEq)]
pub enum LinkEvent {
    /// Ростер изменился (кто-то пришёл/ушёл, welcome принят).
    Roster(Vec<PlayerInfo>),
    /// Конверт от другого стола (уже распознанный).
    Message(Envelope),
    /// Соединение потеряно (наша сторона или пировая).
    Closed(String),
    /// Информационная строка для лога стола.
    Notice(String),
}

// ------------------------------------------------------------------ shared

struct Shared {
    /// Текущий ростер (хост: все, клиент: приём welcome).
    players: Vec<PlayerInfo>,
    /// Исходящие: peer name → writer. У клиента один канал — к хосту ("host").
    peers: HashMap<String, Sender<Vec<u8>>>,
}

type SharedState = Arc<Mutex<Shared>>;

fn push_event(tx: &Sender<LinkEvent>, ev: LinkEvent) {
    // канал в UI не должен ломать сетевой слой, если окно закрыто
    let _ = tx.send(ev);
}

fn roster(players: &[PlayerInfo]) -> LinkEvent {
    LinkEvent::Roster(players.to_vec())
}

/// Каждые KEEPALIVE_SECS — ping; молчаливо отвалившийся пир (кабель выдернули,
/// FIN не пришёл) вычищается из стола, когда канал исходящих умирает.
fn start_keepalive(shared: SharedState, closed: Arc<AtomicBool>, events_tx: Sender<LinkEvent>) {
    start_keepalive_with(shared, closed, events_tx, Duration::from_secs(KEEPALIVE_SECS));
}

fn start_keepalive_with(
    shared: SharedState,
    closed: Arc<AtomicBool>,
    events_tx: Sender<LinkEvent>,
    interval: Duration,
) {
    std::thread::spawn(move || {
        while !closed.load(Ordering::SeqCst) {
            std::thread::sleep(interval);
            let ping = Envelope::new("ping", "system", 0, serde_json::json!({}))
                .to_frame()
                .unwrap_or_default();
            let peers = match shared.lock() {
                Ok(s) => s.peers.clone(),
                Err(_) => continue,
            };
            for (name, out) in peers {
                if out.send(ping.clone()).is_err() {
                    // получатель закрыт: пир исчез без прощания — убираем со стола
                    remove_peer(&shared, &name, &events_tx);
                }
            }
        }
    });
}

/// Убрать пира со стола и разослать обновлённый ростер.
/// Идемпотентно: и читающий поток пира, и keepalive могут вызвать это.
fn remove_peer(shared: &SharedState, name: &str, events_tx: &Sender<LinkEvent>) {
    if let Ok(mut s) = shared.lock() {
        let existed = s.peers.remove(name).is_some();
        if existed {
            s.players.retain(|p| p.name != name);
            let players = s.players.clone();
            let roster_env = Envelope::new(
                "roster",
                "host",
                0,
                serde_json::to_value(&players).unwrap_or_default(),
            )
            .to_frame()
            .unwrap_or_default();
            for out in s.peers.values() {
                let _ = out.send(roster_env.clone());
            }
            push_event(events_tx, roster(&players));
            push_event(events_tx, LinkEvent::Notice(format!("{name} покинул стол")));
        }
    }
}

// ------------------------------------------------------------------ host

pub struct HostHandle {
    pub port: u16,
    /// IP хоста в локальной сети (для приглашения игроков); None — офлайн/неизвестен.
    pub local_ip: Option<String>,
    host_name: String,
    closed: Arc<AtomicBool>,
    shared: SharedState,
    seq: Arc<AtomicU64>,
    events_tx: Sender<LinkEvent>,
}

impl HostHandle {
    /// Рассылка от имени хоста (ростер, служебные, chat мастера).
    /// from — настоящее имя хоста: у игроков в чате виден «Мастер», а не безликий «host».
    pub fn broadcast(&self, kind: &str, body: serde_json::Value) -> Result<(), String> {
        let seq = self.seq.fetch_add(1, Ordering::SeqCst);
        let env = Envelope::new(kind, &self.host_name, seq, body);
        let frame = env.to_frame()?;
        let shared = self.shared.lock().map_err(|_| "poisoned")?;
        for out in shared.peers.values() {
            let _ = out.send(frame.clone());
        }
        push_event(&self.events_tx, LinkEvent::Message(env));
        Ok(())
    }

    pub fn leave(&self) {
        self.closed.store(true, Ordering::SeqCst);
        if let Ok(mut s) = self.shared.lock() {
            s.peers.clear();
        }
    }
}

/// Поднять хост-стол. `campaign_eml` уедет каждому подключившемуся в welcome.
pub fn run_host(
    port: u16,
    table: &str,
    host_name: &str,
    host_actors: Vec<String>,
    master_seed_commit: &str,
    campaign_eml: Option<String>,
    events_tx: Sender<LinkEvent>,
) -> Result<HostHandle, String> {
    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| format!("bind: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let closed = Arc::new(AtomicBool::new(false));
    let shared: SharedState = Arc::new(Mutex::new(Shared {
        players: vec![PlayerInfo {
            name: host_name.to_string(),
            actors: host_actors.clone(),
            is_host: true,
        }],
        peers: HashMap::new(),
    }));

    push_event(
        &events_tx,
        LinkEvent::Notice(format!("Стол «{table}» открыт на порту {port}")),
    );

    let ctx = HostCtx {
        table: table.to_string(),
        master_seed_commit: master_seed_commit.to_string(),
        campaign_eml,
    };

    {
        let shared = shared.clone();
        let closed = closed.clone();
        let events_tx = events_tx.clone();
        std::thread::spawn(move || {
            start_keepalive(shared.clone(), closed.clone(), events_tx.clone());
            for conn in listener.incoming() {
                if closed.load(Ordering::SeqCst) {
                    break;
                }
                let stream = match conn {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                spawn_host_peer(stream, ctx.clone(), shared.clone(), events_tx.clone());
            }
            push_event(&events_tx, LinkEvent::Closed("стол закрыт".into()));
        });
    }

    Ok(HostHandle {
        port,
        local_ip: local_lan_ip(),
        host_name: host_name.to_string(),
        closed,
        shared,
        seq: Arc::new(AtomicU64::new(1)),
        events_tx,
    })
}

#[derive(Clone)]
struct HostCtx {
    table: String,
    master_seed_commit: String,
    campaign_eml: Option<String>,
}

fn spawn_host_peer(mut stream: TcpStream, ctx: HostCtx, shared: SharedState, events_tx: Sender<LinkEvent>) {
    std::thread::spawn(move || {
        let peer_addr = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
        // 1) первый кадр — hello
        let mut reader = BufReader::new(stream.try_clone().ok()?);
        let first = read_frame(&mut reader).ok()??;
        let hello_env = Envelope::from_frame(&first).ok()?;
        if hello_env.kind != "hello" {
            let _ = write_frame(
                &mut stream,
                &Envelope::new("error", "host", 0, serde_json::json!({"text": "expected hello"}))
                    .to_frame()
                    .unwrap_or_default(),
            );
            return Some(());
        }
        let hello: Hello = serde_json::from_value(hello_env.body.clone()).ok()?;
        if hello.proto != PROTOCOL_VERSION {
            let _ = write_frame(
                &mut stream,
                &Envelope::new(
                    "error",
                    "host",
                    0,
                    serde_json::json!({"text": format!("protocol mismatch: server {PROTOCOL_VERSION}, client {}", hello.proto)}),
                )
                .to_frame()
                .unwrap_or_default(),
            );
            return Some(());
        }

        // 2) канал исходящих для этого пира
        let (out_tx, out_rx) = std::sync::mpsc::channel::<Vec<u8>>();

        // 3) регистрация — атомарно: дедуп имени, лимит стола и вставка под одним
        //    локом (иначе два «Елены» одновременно пройдут проверку и затрут друг друга)
        let (name, players, campaign) = {
            let mut s = shared.lock().ok()?;
            if s.peers.len() >= MAX_PEERS {
                let _ = write_frame(
                    &mut stream,
                    &Envelope::new(
                        "error",
                        "host",
                        0,
                        serde_json::json!({"text": format!("table full: max {} players", MAX_PEERS)}),
                    )
                    .to_frame()
                    .unwrap_or_default(),
                );
                return Some(());
            }
            let mut name = hello.name.clone();
            while s.peers.contains_key(&name) {
                name = format!("{name}~");
            }
            s.peers.insert(name.clone(), out_tx.clone());
            s.players.push(PlayerInfo {
                name: name.clone(),
                actors: hello.actors.clone(),
                is_host: false,
            });
            (name, s.players.clone(), ctx.campaign_eml.clone())
        };
        let writer_stream = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => return cleanup_host_peer(&shared, &name, &events_tx),
        };
        std::thread::spawn(move || {
            let mut w = writer_stream;
            for frame in out_rx {
                if write_frame(&mut w, &frame).is_err() {
                    break;
                }
            }
        });

        // 4) welcome + ростер всем
        let welcome = Welcome {
            table: ctx.table.clone(),
            master_seed_commit: ctx.master_seed_commit.clone(),
            campaign_eml: campaign,
            players: players.clone(),
        };
        // welcome уходит через общий канал writer-потока, а не напрямую в stream:
        // write_frame пишет длину и payload отдельными write_all, и при одновременных
        // подключениях чужой roster-броадкаст из writer-потока может вклиниться
        // между ними и испортить поток кадров (welcome «терялся» на переполненном
        // столе). После спавна writer-потока он единственный писатель в сокет.
        let welcome_ok = out_tx
            .send(
                Envelope::new("welcome", "host", 0, serde_json::to_value(&welcome).unwrap_or_default())
                    .to_frame()
                    .unwrap_or_default(),
            )
            .is_ok();
        if !welcome_ok {
            return cleanup_host_peer(&shared, &name, &events_tx);
        }
        push_event(&events_tx, roster(&players));
        // ростер — всем: остальные столы должны видеть, что пришёл новый игрок
        {
            let roster_env = Envelope::new(
                "roster",
                "host",
                0,
                serde_json::to_value(&players).unwrap_or_default(),
            )
            .to_frame()
            .unwrap_or_default();
            let targets: Vec<Sender<Vec<u8>>> = {
                match shared.lock() {
                    Ok(s) => s.peers.values().cloned().collect(),
                    Err(_) => Vec::new(),
                }
            };
            for out in targets {
                let _ = out.send(roster_env.clone());
            }
        }
        push_event(
            &events_tx,
            LinkEvent::Notice(format!("{name} присоединился к столу ({peer_addr})")),
        );

        // 5) relay: всё от пира — остальным + в UI
        while let Ok(Some(frame)) = read_frame(&mut reader) {
            if let Ok(env) = Envelope::from_frame(&frame) {
                // ping от system не релеим и не показываем
                if env.kind == "ping" {
                    continue;
                }
                let env = Envelope { from: name.clone(), ..env };
                push_event(&events_tx, LinkEvent::Message(env.clone()));
                let frame = env.to_frame().unwrap_or_else(|_| frame.clone());
                let targets: Vec<Sender<Vec<u8>>> = {
                    let s = shared.lock().ok()?;
                    s.peers
                        .iter()
                        .filter(|(k, _)| **k != name)
                        .map(|(_, v)| v.clone())
                        .collect()
                };
                for out in targets {
                    let _ = out.send(frame.clone());
                }
            }
        }

        // 6) пир ушёл — убираем со стола (идемпотентно с keepalive)
        cleanup_host_peer(&shared, &name, &events_tx)
    });
}

/// Снять пира со стола и сообщить остальным. Пир мог уже быть вычищен
/// keepalive'ом или другой веткой — тогда ничего не делает.
fn cleanup_host_peer(shared: &SharedState, name: &str, events_tx: &Sender<LinkEvent>) -> Option<()> {
    remove_peer(shared, name, events_tx);
    Some(())
}

// ------------------------------------------------------------------ client

pub struct ClientHandle {
    closed: Arc<AtomicBool>,
    seq: Arc<AtomicU64>,
    out: Sender<Vec<u8>>,
    pub server_addr: String,
}

impl ClientHandle {
    /// Отправка конверта хосту (тот разрулит релей).
    pub fn send(&self, kind: &str, body: serde_json::Value) -> Result<(), String> {
        let seq = self.seq.fetch_add(1, Ordering::SeqCst);
        let frame = Envelope::new(kind, "me", seq, body).to_frame()?;
        self.out.send(frame).map_err(|_| "connection closed".into())
    }

    pub fn leave(&self) {
        let _ = self.send("bye", serde_json::json!({}));
        self.closed.store(true, Ordering::SeqCst);
    }
}

/// Подключиться к столу. Возвращает дескриптор; welcome придёт событием.
pub fn run_client(
    addr: &str,
    my_name: &str,
    my_actors: Vec<String>,
    events_tx: Sender<LinkEvent>,
) -> Result<ClientHandle, String> {
    let stream = TcpStream::connect(addr).map_err(|e| format!("connect: {e}"))?;
    stream.set_nodelay(true).ok();
    let server_addr = stream.peer_addr().map(|a| a.to_string()).unwrap_or(addr.into());
    let closed = Arc::new(AtomicBool::new(false));

    let mut writer_stream = stream.try_clone().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);

    let hello = Hello {
        name: my_name.to_string(),
        actors: my_actors,
        proto: PROTOCOL_VERSION,
    };
    write_frame(
        &mut writer_stream,
        &Envelope::new("hello", my_name, 0, serde_json::to_value(&hello).unwrap_or_default())
            .to_frame()?,
    )
    .map_err(|e| format!("hello: {e}"))?;

    let (out_tx, out_rx) = std::sync::mpsc::channel::<Vec<u8>>();
    {
        let closed = closed.clone();
        std::thread::spawn(move || {
            for frame in out_rx {
                if write_frame(&mut writer_stream, &frame).is_err() || closed.load(Ordering::SeqCst) {
                    break;
                }
            }
        });
    }

    {
        let closed = closed.clone();
        let events_tx = events_tx.clone();
        std::thread::spawn(move || {
            while !closed.load(Ordering::SeqCst) {
                match read_frame(&mut reader) {
                    Ok(Some(frame)) => {
                        if let Ok(env) = Envelope::from_frame(&frame) {
                            if env.kind == "ping" {
                                continue;
                            }
                            // нормализация: ростер и welcome — событие Roster,
                            // чтобы UI клиента и хоста получали одинаковые типы
                            match env.kind.as_str() {
                                "roster" => {
                                    if let Ok(players) =
                                        serde_json::from_value::<Vec<PlayerInfo>>(env.body.clone())
                                    {
                                        push_event(&events_tx, LinkEvent::Roster(players));
                                        continue;
                                    }
                                }
                                "welcome" => {
                                    if let Ok(w) = serde_json::from_value::<Welcome>(env.body.clone())
                                    {
                                        push_event(&events_tx, LinkEvent::Roster(w.players.clone()));
                                        push_event(&events_tx, LinkEvent::Message(env));
                                        continue;
                                    }
                                }
                                _ => {}
                            }
                            push_event(&events_tx, LinkEvent::Message(env));
                        }
                    }
                    Ok(None) | Err(_) => break,
                }
            }
            closed.store(true, Ordering::SeqCst);
            push_event(&events_tx, LinkEvent::Closed("соединение с хостом потеряно".into()));
        });
    }

    push_event(&events_tx, LinkEvent::Notice(format!("Подключено к {server_addr}")));
    Ok(ClientHandle {
        closed,
        seq: Arc::new(AtomicU64::new(1)),
        out: out_tx,
        server_addr,
    })
}

// ------------------------------------------------------------------ commit-reveal helpers

/// Канонический коммит интента: sha256(url-canonical-json(intent) + "|" + seed).
/// Каноничность даёт serde_json с сортировкой ключей (BTreeMap-подобный обход
/// через to_value → sort) — одинаковые интенты дают одинаковый коммит.
pub fn intent_commit(intent: &serde_json::Value, dice_seed: &str) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let canonical = canonical_json(intent)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    hasher.update(b"|");
    hasher.update(dice_seed.as_bytes());
    let out = hasher.finalize();
    Ok(out.iter().map(|b| format!("{b:02x}")).collect())
}

/// Канонический JSON: ключи объектов отсортированы (рекурсивно).
pub fn canonical_json(v: &serde_json::Value) -> Result<String, String> {
    match v {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts = keys
                .iter()
                .map(|k| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap_or_default(),
                        canonical_json(&map[*k]).unwrap_or_default()
                    )
                })
                .collect::<Vec<_>>();
            Ok(format!("{{{}}}", parts.join(",")))
        }
        serde_json::Value::Array(items) => {
            let parts = items
                .iter()
                .map(|i| canonical_json(i).unwrap_or_default())
                .collect::<Vec<_>>();
            Ok(format!("[{}]", parts.join(",")))
        }
        other => serde_json::to_string(other).map_err(|e| e.to_string()),
    }
}

/// Чексумма результата раунда для сверки столов.
pub fn round_checksum(state: &serde_json::Value) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let canonical = canonical_json(state)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

// ------------------------------------------------------------------ tests

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Receiver};

    fn drain<T>(rx: &Receiver<T>) -> Vec<T> {
        let mut out = Vec::new();
        while let Ok(v) = rx.try_recv() {
            out.push(v);
        }
        out
    }

    #[test]
    fn frame_roundtrip() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let t = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut r = BufReader::new(s.try_clone().unwrap());
            let got = read_frame(&mut r).unwrap().unwrap();
            write_frame(&mut s, &got).unwrap();
        });
        let mut c = TcpStream::connect(addr).unwrap();
        write_frame(&mut c, b"{\"ping\":1}").unwrap();
        t.join().unwrap();
        let mut r = BufReader::new(c.try_clone().unwrap());
        assert_eq!(read_frame(&mut r).unwrap().unwrap(), b"{\"ping\":1}");
    }

    #[test]
    fn frame_rejects_oversize() {
        let bytes = (MAX_FRAME + 1).to_be_bytes();
        // клиент пытается объявить слишком большой кадр — сервер обязан отказать
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let t = std::thread::spawn(move || {
            let (s, _) = listener.accept().unwrap();
            let mut r = BufReader::new(s);
            read_frame(&mut r).is_err()
        });
        let mut c = TcpStream::connect(addr).unwrap();
        c.write_all(&bytes).unwrap();
        assert!(t.join().unwrap(), "oversize frame must be rejected");
    }

    #[test]
    fn envelope_serde_stable() {
        let env = Envelope::new(
            "intent_commit",
            "elena",
            7,
            serde_json::json!({"round": 3, "commit": "ab12"}),
        );
        let frame = env.to_frame().unwrap();
        let back = Envelope::from_frame(&frame).unwrap();
        assert_eq!(env, back);
    }

    #[test]
    fn canonical_json_sorts_keys() {
        let a: serde_json::Value = serde_json::from_str(r#"{"b":1,"a":{"z":true,"y":[2,1]}}"#).unwrap();
        let b: serde_json::Value = serde_json::from_str(r#"{"a":{"y":[2,1],"z":true},"b":1}"#).unwrap();
        assert_eq!(canonical_json(&a).unwrap(), canonical_json(&b).unwrap());
        assert_ne!(canonical_json(&a).unwrap(), canonical_json(&serde_json::json!({"b":1,"a":{"z":false,"y":[2,1]}})).unwrap());
    }

    #[test]
    fn intent_commit_is_deterministic_and_sensitive() {
        let intent = serde_json::json!({"type":"attack","target":"mob_1"});
        let c1 = intent_commit(&intent, "seed-1").unwrap();
        let c2 = intent_commit(&intent, "seed-1").unwrap();
        let c3 = intent_commit(&intent, "seed-2").unwrap();
        assert_eq!(c1, c2, "same intent+seed → same commit");
        assert_ne!(c1, c3, "different seed → different commit");
        assert_eq!(c1.len(), 64);
    }

    /// Полный цикл: хост + два клиента, коммит → релей → раскрытие у всех.
    #[test]
    fn host_relays_commit_reveal_between_two_clients() {
        let (host_ev, _host_ev_rx) = channel();
        let host = run_host(0, "Крипта", "Мастер", vec![], "seedcommit_ab", None, host_ev).unwrap();
        assert!(host.port > 0);

        let (c1_ev, c1_rx) = channel();
        let (c2_ev, c2_rx) = channel();
        let cl1 = run_client(&format!("127.0.0.1:{}", host.port), "Elena", vec!["char_wizard".into()], c1_ev).unwrap();
        let cl2 = run_client(&format!("127.0.0.1:{}", host.port), "Torin", vec!["char_warrior".into()], c2_ev).unwrap();

        // ждём ростер, в котором уже есть хост и оба игрока (welcome прилетает
        // каждому при входе; более поздние join'ы — обновлениями ростера)
        let wait_roster = |rx: &Receiver<LinkEvent>, want: usize| -> Vec<PlayerInfo> {
            for _ in 0..300 {
                for ev in drain(rx) {
                    if let LinkEvent::Roster(r) = ev {
                        if r.len() >= want {
                            return r;
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            panic!("no roster with {want} players");
        };
        wait_roster(&c1_rx, 3);
        wait_roster(&c2_rx, 3);

        // коммит от Елены: Торин получает через релей хоста
        let commit = serde_json::json!({"round": 3, "commit": "ff00"});
        cl1.send("intent_commit", commit).unwrap();
        let mut torin_got = false;
        for _ in 0..100 {
            for ev in drain(&c2_rx) {
                if let LinkEvent::Message(env) = ev {
                    if env.kind == "intent_commit" && env.from == "Elena" {
                        torin_got = true;
                    }
                }
            }
            if torin_got {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(torin_got, "Torin must receive Elena's commit via host relay");

        // раскрытие и round_result в обе стороны
        cl1.send("intent_reveal", serde_json::json!({"round": 3, "intent": {"type":"attack"}})).unwrap();
        cl2.send("round_result", serde_json::json!({"round": 3, "checksum": "zz"})).unwrap();
        let mut got_reveal_on_c2 = false;
        let mut got_result_on_c1 = false;
        for _ in 0..200 {
            for ev in drain(&c2_rx) {
                if let LinkEvent::Message(env) = ev {
                    if env.kind == "intent_reveal" {
                        got_reveal_on_c2 = true;
                    }
                }
            }
            for ev in drain(&c1_rx) {
                if let LinkEvent::Message(env) = ev {
                    if env.kind == "round_result" {
                        got_result_on_c1 = true;
                    }
                }
            }
            if got_reveal_on_c2 && got_result_on_c1 {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(got_reveal_on_c2 && got_result_on_c1, "both directions must relay");

        cl1.leave();
        cl2.leave();
        host.leave();
    }

    /// Свиток кампании уезжает игроку в welcome.
    #[test]
    fn welcome_carries_campaign_scroll() {
        let (ev_tx, _ev_rx) = channel();
        let host = run_host(
            0,
            "ScrollTest",
            "Мастер",
            vec![],
            "c0",
            Some("From: chronicle@game\r\nSubject: Пепельная крипта\r\n\r\n...".into()),
            ev_tx,
        )
        .unwrap();
        let (c_ev, c_rx) = channel();
        let _client = run_client(&format!("127.0.0.1:{}", host.port), "Elena", vec![], c_ev).unwrap();
        let mut got_scroll = false;
        for _ in 0..200 {
            for ev in drain(&c_rx) {
                if let LinkEvent::Message(env) = ev {
                    if env.kind == "welcome" {
                        let w: Welcome = serde_json::from_value(env.body).unwrap();
                        if w.campaign_eml.is_some() && w.table == "ScrollTest" {
                            got_scroll = true;
                        }
                    }
                }
            }
            if got_scroll {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(got_scroll, "welcome must carry the campaign scroll");
        host.leave();
    }

    /// Дубликат имени не рушит стол: второй получает суффикс и оба живут.
    #[test]
    fn duplicate_names_get_suffixed() {
        let (ev_tx, ev_rx) = channel();
        let host = run_host(0, "Dup", "Мастер", vec![], "c", None, ev_tx).unwrap();
        let (e1, _r1) = channel();
        let (e2, r2) = channel();
        let c1 = run_client(&format!("127.0.0.1:{}", host.port), "Elena", vec![], e1).unwrap();
        let c2 = run_client(&format!("127.0.0.1:{}", host.port), "Elena", vec![], e2).unwrap();
        std::thread::sleep(Duration::from_millis(400));
        // хост увидел Notice о втором "Elena~"
        let joined = drain(&ev_rx)
            .iter()
            .filter_map(|ev| match ev {
                LinkEvent::Notice(n) => Some(n.clone()),
                _ => None,
            })
            .any(|n| n.contains("Elena~"));
        assert!(joined, "second Elena must be registered under a suffixed name");
        // оба канала живы: релей доходит обоим
        c1.send("chat", serde_json::json!({"text": "hi"})).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let got2 = drain(&r2).iter().any(|ev| matches!(ev, LinkEvent::Message(_)));
        assert!(got2, "suffixed peer must receive relayed chat");
        c1.leave();
        c2.leave();
        host.leave();
    }

    /// Broadcast хоста подписан его настоящим именем: игроки видят «Мастер», не «host».
    #[test]
    fn host_broadcast_carries_real_host_name() {
        let (ev_tx, _ev_rx) = channel();
        let host = run_host(0, "Имя", "Мастер Инквизиции", vec![], "c", None, ev_tx).unwrap();
        let (c_ev, c_rx) = channel();
        let _c = run_client(&format!("127.0.0.1:{}", host.port), "Elena", vec![], c_ev).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        host.broadcast("chat", serde_json::json!({"text": "начинаем"})).unwrap();
        let mut got = false;
        for _ in 0..100 {
            for ev in drain(&c_rx) {
                if let LinkEvent::Message(env) = ev {
                    if env.kind == "chat" && env.from == "Мастер Инквизиции" {
                        got = true;
                    }
                }
            }
            if got {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(got, "broadcast must carry the host's real name, not 'host'");
        host.leave();
    }

    /// Стол не резиновый: 13-й клиент получает error-кадр, остальные 12 — welcome.
    #[test]
    fn table_rejects_clients_over_cap() {
        let (ev_tx, _ev_rx) = channel();
        let host = run_host(0, "Full", "Мастер", vec![], "c", None, ev_tx).unwrap();
        let mut clients = Vec::new();
        let mut rxs = Vec::new();
        for i in 0..(MAX_PEERS + 1) {
            let (e, r) = channel();
            let c = run_client(&format!("127.0.0.1:{}", host.port), &format!("P{i}"), vec![], e)
                .unwrap();
            clients.push(c);
            rxs.push(r);
        }
        let mut errors = 0;
        let mut welcomes = 0;
        // дедлайн по времени, а не по числу итераций: на притормозившем
        // раннере 12 рукопожатий могут занять больше пяти секунд
        let deadline = std::time::Instant::now() + Duration::from_secs(20);
        while std::time::Instant::now() < deadline {
            for r in &rxs {
                for ev in drain(r) {
                    if let LinkEvent::Message(env) = ev {
                        match env.kind.as_str() {
                            "error" => errors += 1,
                            "welcome" => welcomes += 1,
                            _ => {}
                        }
                    }
                }
            }
            if errors + welcomes > MAX_PEERS {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(errors, 1, "exactly one client over the cap must be rejected");
        assert_eq!(welcomes, MAX_PEERS, "all clients under the cap must be welcomed");
        for c in &clients {
            c.leave();
        }
        host.leave();
    }

    /// Пир, умерший молча (без FIN), вычищается keepalive'ом: канал исходящих
    /// умирает, ping в него упасть не может — пир снимается со стола.
    #[test]
    fn keepalive_removes_silently_dead_peer() {
        let shared: SharedState = Arc::new(Mutex::new(Shared {
            players: vec![
                PlayerInfo { name: "Мастер".into(), actors: vec![], is_host: true },
                PlayerInfo { name: "Live".into(), actors: vec![], is_host: false },
                PlayerInfo { name: "Dead".into(), actors: vec![], is_host: false },
            ],
            peers: HashMap::new(),
        }));
        let (live_tx, live_rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let (dead_tx, dead_rx) = std::sync::mpsc::channel::<Vec<u8>>();
        drop(dead_rx); // мёртвый пир: писать некому
        shared.lock().unwrap().peers.insert("Live".into(), live_tx);
        shared.lock().unwrap().peers.insert("Dead".into(), dead_tx);

        let (tx, rx) = channel();
        let closed = Arc::new(AtomicBool::new(false));
        start_keepalive_with(shared.clone(), closed.clone(), tx, Duration::from_millis(30));

        let mut cleaned = false;
        for _ in 0..150 {
            for ev in drain(&rx) {
                if let LinkEvent::Roster(r) = ev {
                    if r.iter().all(|p| p.name != "Dead") && r.iter().any(|p| p.name == "Live") {
                        cleaned = true;
                    }
                }
            }
            if cleaned {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(cleaned, "silently dead peer must be removed from the table");
        closed.store(true, Ordering::SeqCst);
        let _still_open = live_rx; // живой пир остаётся подключённым
    }
}
