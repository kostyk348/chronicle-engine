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
      eprintln!(
        "[Chronicle] EGL недоступен (ошибка 0x{code:x}) — WebKit умрёт с серым окном.\n\
         [Chronicle] Обход: __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 <команда запуска>\n\
         [Chronicle] Либо поставьте .deb — он использует системные webkit и Mesa."
      );
    }
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

    // Жёстче: на системах с битым EGL (NVIDIA + GLVND, свежие драйверы)
    // WebProcess падает на самом старте с «Could not create default EGL
    // display: EGL_BAD_PARAMETER. Aborting...» — окно остаётся серым при
    // любых композитинг-флагах. Софтверный Mesa-EGL (llvmpipe) поднимается
    // всегда, а этому UI аппаратное ускорение не нужно. CHRONICLE_FORCE_GPU=1
    // отменяет софтверный режим для желающих проверить аппаратный путь.
    if std::env::var("CHRONICLE_FORCE_GPU").is_err() {
      std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");

      // Частая история на Mint/Ubuntu с проприетарным NVIDIA: GLVND видит
      // только NVIDIA-вендора (его конфиг подменил Mesa-шный), и софтверный
      // путь не выбирается даже с LIBGL_ALWAYS_SOFTWARE. Направляем GLVND на
      // Mesa принудительно, если её vendor-json на месте.
      const MESA_VENDOR: &str = "/usr/share/glvnd/egl_vendor.d/50_mesa.json";
      if std::path::Path::new(MESA_VENDOR).exists() {
        std::env::set_var("__EGL_VENDOR_LIBRARY_FILENAMES", MESA_VENDOR);
      }
    }

    egl_probe();
  }

  chronicle_lib::run();
}
