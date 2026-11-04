// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Проба EGL до создания окна. На системах с битым GPU-стеком WebKit-процесс
/// умирает молча («Could not create default EGL display ... Aborting...»), и
/// пользователь видит серое окно без единого объяснения. Здесь мы повторяем
/// ровно ту же инициализацию, что делает WebKit, и печатаем в stderr причину
/// и готовую команду обхода — диагностика живёт в логе, а не в телепатии.
#[cfg(target_os = "linux")]
fn egl_probe() {
  unsafe {
    let lib = libc::dlopen(b"libEGL.so.1\0".as_ptr() as *const libc::c_char, libc::RTLD_NOW);
    if lib.is_null() {
      eprintln!(
        "[Chronicle] EGL: libEGL.so.1 не загрузилась — в системе нет EGL.\n\
         [Chronicle] Лечение: sudo apt install libegl1 libgl1"
      );
      return;
    }
    let sym = |name: &[u8]| libc::dlsym(lib, name.as_ptr() as *const libc::c_char);
    let get_display_sym = sym(b"eglGetDisplay\0");
    let initialize_sym = sym(b"eglInitialize\0");
    let get_error_sym = sym(b"eglGetError\0");
    if get_display_sym.is_null() || initialize_sym.is_null() || get_error_sym.is_null() {
      eprintln!("[Chronicle] EGL: в libEGL нет базовых символов — стек GLVND сломан");
      return;
    }
    type GetDisplay = unsafe extern "C" fn(*mut core::ffi::c_void) -> *mut core::ffi::c_void;
    type Initialize = unsafe extern "C" fn(*mut core::ffi::c_void, *mut i32, *mut i32) -> u32;
    type GetError = unsafe extern "C" fn() -> i32;
    let get_display: GetDisplay = std::mem::transmute(get_display_sym);
    let initialize: Initialize = std::mem::transmute(initialize_sym);
    let get_error: GetError = std::mem::transmute(get_error_sym);
    let (mut major, mut minor) = (0, 0);
    let display = get_display(core::ptr::null_mut());
    let ok = !display.is_null() && initialize(display, &mut major, &mut minor) != 0;
    if ok {
      eprintln!("[Chronicle] EGL OK: EGL {major}.{minor} (софтверный режим активен)");
    } else {
      let code = get_error();
      let vendor = std::env::var("__EGL_VENDOR_LIBRARY_FILENAMES").unwrap_or_default();
      let mesa = find_mesa_egl_lib().unwrap_or("не найдена");
      eprintln!(
        "[Chronicle] EGL недоступен (ошибка 0x{code:x}) — WebKit умрёт с «Could not create default EGL display».\n\
         [Chronicle] Состояние: __EGL_VENDOR_LIBRARY_FILENAMES={vendor:?}, libEGL_mesa: {mesa}\n\
         [Chronicle] Лечение: sudo apt install libegl-mesa0 libgl1-mesa-dri — и запустить снова.\n\
         [Chronicle] Либо поставьте .deb — он тянет зависимости автоматически."
      );
    }
  }
}

/// Где искать vendor-библиотеку EGL от Mesa (Debian/Ubuntu/Mint multiarch,
/// Fedora, Arch). Берём первую существующую.
#[cfg(target_os = "linux")]
fn find_mesa_egl_lib() -> Option<&'static str> {
  const CANDIDATES: [&str; 5] = [
    "/usr/lib/x86_64-linux-gnu/libEGL_mesa.so.0",
    "/usr/lib/aarch64-linux-gnu/libEGL_mesa.so.0",
    "/usr/lib/riscv64-linux-gnu/libEGL_mesa.so.0",
    "/usr/lib64/libEGL_mesa.so.0",
    "/usr/lib/libEGL_mesa.so.0",
  ];
  CANDIDATES.into_iter().find(|p| std::path::Path::new(p).exists())
}

/// Восстановление EGL до инициализации WebKit. Фатальный случай — «Could not
/// create default EGL display: EGL_BAD_PARAMETER»: GLVND не находит ни одного
/// вендора, обычно потому что .run-установщик NVIDIA подменил или удалил
/// /usr/share/glvnd/egl_vendor.d/50_mesa.json. Тогда генерируем vendor-json
/// сами — на найденную системную libEGL_mesa.so.0 — и направляем GLVND на неё.
/// Если Mesa-EGL в системе нет вовсе, никакая переменная не спасёт: печатаем
/// точную apt-команду. Пользовательские значения переменных не перетираем.
#[cfg(target_os = "linux")]
fn egl_rescue() {
  if std::env::var_os("CHRONICLE_FORCE_GPU").is_some() {
    eprintln!("[Chronicle] CHRONICLE_FORCE_GPU задан — софтверный обход EGL отключён");
    return;
  }
  if std::env::var_os("LIBGL_ALWAYS_SOFTWARE").is_none() {
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
  }
  if std::env::var_os("__EGL_VENDOR_LIBRARY_FILENAMES").is_some() {
    return; // пользователь настроил GLVND сам — не вмешиваемся
  }
  for json in [
    "/usr/share/glvnd/egl_vendor.d/50_mesa.json",
    "/etc/glvnd/egl_vendor.d/50_mesa.json",
  ] {
    if std::path::Path::new(json).exists() {
      std::env::set_var("__EGL_VENDOR_LIBRARY_FILENAMES", json);
      return;
    }
  }
  match find_mesa_egl_lib() {
    Some(lib) => {
      let generated = std::env::temp_dir().join("chronicle-egl-vendor-mesa.json");
      let body =
        format!("{{\"file_format_version\":\"1.0.0\",\"ICD\":{{\"library_path\":\"{lib}\"}}}}\n");
      match std::fs::write(&generated, body) {
        Ok(()) => {
          std::env::set_var("__EGL_VENDOR_LIBRARY_FILENAMES", &generated);
          eprintln!(
            "[Chronicle] 50_mesa.json в системе нет — сгенерирован {}, вендор: {lib}",
            generated.display()
          );
        }
        Err(e) => eprintln!("[Chronicle] не удалось записать {}: {e}", generated.display()),
      }
    }
    None => eprintln!(
      "[Chronicle] libEGL_mesa.so.0 не найдена — софтверный EGL невозможен.\n\
       [Chronicle] Лечение: sudo apt install libegl-mesa0 libgl1-mesa-dri"
    ),
  }
}

fn main() {
  // WebKitGTK на части Linux-драйверов (NVIDIA, старый Mesa) рисует серый
  // экран вместо окна — известная беда DMABUF-композитинга WebKit. Отключаем
  // до создания окна; стоимость — софтверный путь композитинга, на интерфейсе
  // карты это не заметно.
  #[cfg(target_os = "linux")]
  {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    egl_rescue();
    egl_probe();
  }

  chronicle_lib::run();
}
