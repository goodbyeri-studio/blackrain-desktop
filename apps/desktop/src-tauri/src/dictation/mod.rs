// Windows 暂时走 stub:whisper-rs 0.12 的 bindgen 与 LLVM 22 不兼容,
// dev 路径不需要语音输入；Windows 发布路线恢复时需重新验证。
// 「whisper-rs Windows 构建踩坑记录」。
#[cfg_attr(any(target_os = "ios", target_os = "android", target_os = "windows"), path = "stub.rs")]
#[cfg_attr(not(any(target_os = "ios", target_os = "android", target_os = "windows")), path = "real.rs")]
mod imp;

pub(crate) use imp::*;
