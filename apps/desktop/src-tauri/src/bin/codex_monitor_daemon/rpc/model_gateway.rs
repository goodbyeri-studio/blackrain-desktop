use super::*;
use crate::shared::model_gateway_core::{
    model_gateway_refresh_models_core, model_gateway_test_provider_core,
    ModelGatewayProviderProbeInput,
};
use serde::de::DeserializeOwned;
use serde::Serialize;

fn parse_input<T: DeserializeOwned>(params: &Value) -> Result<T, String> {
    let input_value = params
        .as_object()
        .and_then(|map| map.get("input"))
        .cloned()
        .ok_or_else(|| "missing `input`".to_string())?;
    serde_json::from_value(input_value).map_err(|err| err.to_string())
}

fn serialize_value<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|err| err.to_string())
}

pub(super) async fn try_handle(method: &str, params: &Value) -> Option<Result<Value, String>> {
    match method {
        "model_gateway_test_provider" => {
            let input = match parse_input::<ModelGatewayProviderProbeInput>(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                model_gateway_test_provider_core(input)
                    .await
                    .and_then(serialize_value),
            )
        }
        "model_gateway_refresh_models" => {
            let input = match parse_input::<ModelGatewayProviderProbeInput>(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                model_gateway_refresh_models_core(input)
                    .await
                    .and_then(serialize_value),
            )
        }
        _ => None,
    }
}
