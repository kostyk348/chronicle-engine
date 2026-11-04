// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // WebKitGTK на части Linux-драйверов (NVIDIA, старый Mesa) рисует серый
  // экран вместо окна — известная беда DMABUF-композитинга WebKit. Отключаем
  // до создания окна, чтобы AppImage работал из коробки; стоимость — софтверный
  // путь композитинга, на интерфейсе карты это не заметно. Второй флаг добивает
  // ускоренный композитинг целиком — бывают драйверы, где одного DMABUF мало.
  #[cfg(target_os = "linux")]
  {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
  }

  chronicle_lib::run();
}
