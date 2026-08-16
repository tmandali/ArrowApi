use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Manager,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;

/// Native Güncelleme Kontrol ve Kurulum Fonksiyonu
async fn check_for_updates_native(app: AppHandle, silent_if_latest: bool) {
    if let Ok(updater) = app.updater() {
        match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                let current = update.current_version.clone();

                // Native OS Onay Kutusu
                let answer = app
                    .dialog()
                    .message(format!(
                        "Yeni bir Yula sürümü bulundu!\n\nMevcut: v{}\nYeni: v{}\n\nGüncellemeyi şimdi indirip kurmak ister misiniz?",
                        current, version
                    ))
                    .title("Yula Güncelleme")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                    .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                        "Şimdi Yükle".to_string(),
                        "Daha Sonra".to_string(),
                    ))
                    .blocking_show();

                if answer {
                    // Güncellemeyi indir ve kur
                    let install_res = update
                        .download_and_install(|_chunk, _total| {}, || {})
                        .await;

                    match install_res {
                        Ok(_) => {
                            app.dialog()
                                .message("Güncelleme başarıyla indirildi. Değişikliklerin geçerli olması için uygulama yeniden başlatılacak.")
                                .title("Yeniden Başlatılıyor")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                                .blocking_show();

                            app.restart();
                        }
                        Err(err) => {
                            app.dialog()
                                .message(format!("Güncelleme kurulurken bir hata oluştu:\n{}", err))
                                .title("Güncelleme Hatası")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                                .blocking_show();
                        }
                    }
                }
            }
            Ok(None) => {
                if !silent_if_latest {
                    app.dialog()
                        .message("Tebrikler! Yula uygulamasının en güncel sürümünü kullanıyorsunuz.")
                        .title("Güncelleme Bilgisi")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                        .blocking_show();
                }
            }
            Err(err) => {
                if !silent_if_latest {
                    let err_str = err.to_string();
                    if err_str.contains("no release") || err_str.contains("404") {
                        app.dialog()
                            .message("Yula uygulamasının en güncel sürümünü kullanıyorsunuz.")
                            .title("Güncelleme Bilgisi")
                            .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                            .blocking_show();
                    } else {
                        app.dialog()
                            .message(format!("Güncelleme kontrolü sırasında hata oluştu:\n{}", err_str))
                            .title("Güncelleme Bilgisi")
                            .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                            .blocking_show();
                    }
                }
            }
        }
    }
}

/// React arayüzünden doğrudan tetiklenebilen ortak Tauri Command
#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<(), String> {
    check_for_updates_native(app, false).await;
    Ok(())
}

/// React arayüzünden veya menüden DevTools açıp/kapatma komutu
#[tauri::command]
fn toggle_devtools(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
}

// Tauri 2.0 ana kütüphane başlatıcı fonksiyonu
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 1. Python Sidecar için Shell eklentisi
        .plugin(tauri_plugin_shell::init())
        // 2. Otomatik güncelleme (auto-updater) eklentisi
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 3. Güncelleme sonrası uygulamayı yeniden başlatma eklentisi
        .plugin(tauri_plugin_process::init())
        // 4. Native OS diyalog pencereleri eklentisi
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            check_for_updates,
            toggle_devtools
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Ortak / Özel Menü Öğeleri
            let toggle_devtools_item = MenuItemBuilder::with_id("toggle_devtools", "Toggle Developer Tools")
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)?;

            let reload_item = MenuItemBuilder::with_id("reload_window", "Reload Window")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;

            let docs_item = MenuItemBuilder::with_id("open_docs", "Documentation")
                .build(app)?;

            let release_notes_item = MenuItemBuilder::with_id("release_notes", "Release Notes")
                .build(app)?;

            let report_issue_item = MenuItemBuilder::with_id("report_issue", "Report Issue...")
                .build(app)?;

            // Help (Yardım) Menüsü
            #[cfg(target_os = "macos")]
            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&docs_item)
                .item(&release_notes_item)
                .separator()
                .item(&report_issue_item)
                .build()?;

            #[cfg(not(target_os = "macos"))]
            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&docs_item)
                .item(&release_notes_item)
                .separator()
                .item(&report_issue_item)
                .separator()
                .item(&PredefinedMenuItem::about(app, Some("Yula"), None)?)
                .build()?;

            // macOS Menü Çubuğu (Antigravity standardı)
            #[cfg(target_os = "macos")]
            let menu = {
                let check_updates_app = MenuItemBuilder::with_id("check_updates_app", "Check for Updates...")
                    .build(app)?;

                let app_menu = SubmenuBuilder::new(app, "Yula")
                    .item(&PredefinedMenuItem::about(app, Some("Yula"), None)?)
                    .item(&check_updates_app)
                    .separator()
                    .item(&PredefinedMenuItem::services(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;

                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;

                let view_menu = SubmenuBuilder::new(app, "View")
                    .item(&reload_item)
                    .separator()
                    .item(&PredefinedMenuItem::fullscreen(app, None)?)
                    .separator()
                    .item(&toggle_devtools_item)
                    .build()?;

                let window_menu = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;

                MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&window_menu)
                    .item(&help_menu)
                    .build()?
            };

            // Windows / Linux Menü Çubuğu
            #[cfg(not(target_os = "macos"))]
            let menu = {
                let check_updates_app = MenuItemBuilder::with_id("check_updates_app", "Check for Updates...")
                    .build(app)?;

                let app_menu = SubmenuBuilder::new(app, "Yula")
                    .item(&PredefinedMenuItem::about(app, Some("Yula"), None)?)
                    .item(&check_updates_app)
                    .build()?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;

                let view_menu = SubmenuBuilder::new(app, "View")
                    .item(&reload_item)
                    .separator()
                    .item(&PredefinedMenuItem::fullscreen(app, None)?)
                    .separator()
                    .item(&toggle_devtools_item)
                    .build()?;

                MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&help_menu)
                    .build()?
            };

            app.set_menu(menu)?;

            // Native Menü Olay Dinleyicisi
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                match id {
                    "check_updates_app" | "check_updates" => {
                        let h = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            check_for_updates_native(h, false).await;
                        });
                    }
                    "toggle_devtools" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if window.is_devtools_open() {
                                window.close_devtools();
                            } else {
                                window.open_devtools();
                            }
                        }
                    }
                    "reload_window" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.location.reload()");
                        }
                    }
                    "open_docs" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.open('https://github.com/tmandali/ArrowApi', '_blank')");
                        }
                    }
                    "release_notes" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.open('https://github.com/tmandali/ArrowApi/releases', '_blank')");
                        }
                    }
                    "report_issue" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.open('https://github.com/tmandali/ArrowApi/issues', '_blank')");
                        }
                    }
                    _ => {}
                }
            });

            // Açılışta 3 saniye sonra arka planda sessiz güncelleme kontrolü
            let startup_handle = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                tauri::async_runtime::block_on(async move {
                    check_for_updates_native(startup_handle, true).await;
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması çalıştırılırken bir hata oluştu");
}
