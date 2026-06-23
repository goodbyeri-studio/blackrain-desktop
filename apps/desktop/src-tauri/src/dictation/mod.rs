#[cfg_attr(target_os = "macos", path = "real.rs")]
#[cfg_attr(not(target_os = "macos"), path = "stub.rs")]
mod imp;

pub(crate) use imp::*;
