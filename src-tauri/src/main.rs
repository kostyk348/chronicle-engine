// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
    }
  }

  chronicle_lib::run();
}
