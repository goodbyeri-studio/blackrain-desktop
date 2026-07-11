//! Hermes WORK surface 的共享领域核心。
//!
//! 这里先冻结上游 raw contract 和 BlackRain 稳定 contract。后续 config、client、
//! supervisor、normalizer 和 task store 都必须继续落在本模块下，App/Daemon 只做薄适配。

pub(crate) mod client;
pub(crate) mod config;
pub(crate) mod credential_store;
pub(crate) mod events;
pub(crate) mod process;
pub(crate) mod protocol;
pub(crate) mod recovery;
pub(crate) mod runtime;
pub(crate) mod tasks;
pub(crate) mod types;

#[cfg(test)]
pub(crate) mod fake_server;
