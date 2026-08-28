// Windows sistemlerinde release derlemesinde gereksiz terminal penceresini engeller
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yula_lib::run();
}
