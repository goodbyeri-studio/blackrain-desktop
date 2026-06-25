// 002-accounts-credits：兼容性重导出。
// 账号状态真源已上移到 context/AccountProvider（全 App 单一真源）。
// 此文件保留旧 import 路径，消费方无需改动。
export {
  useAccount,
  useAccountOptional,
  type AccountContextValue as UseAccountResult,
} from "../context/AccountProvider";
