# AGENTS.md — 项目规则（AI 与开发者共同遵守）

> 详细规范见 [ARCHITECTURE.md](./ARCHITECTURE.md)。本文为强制要点，执行代码任务时必须遵循。

## 项目简介

物联网传感器与执行器控制（Web 前端）。Vite + 纯 JavaScript（无框架）+ Vitest 单元测试。MQTT 通信，Modbus RTU 协议。

## 常用命令

```
npm test            # 运行全部测试（Vitest）
npm run dev         # 开发服务器（Vite）
npm run build       # 生产构建
npm run check       # 测试 + 构建
```

## 分层结构（强制）

```
src/
├── main.js        ← 装配根：唯一允许跨层 import 的文件
├── core/          ← 用例层：业务逻辑、协议纯函数
├── adapters/      ← 适配层：MQTT、存储等外部 I/O
├── entities/      ← 实体层：配置常量、提取规则
└── ui/            ← 表现层：DOM 渲染
```

### 依赖方向（违反 = 拒绝合并）

```
表现层 → 用例层 → 适配层 → 实体层
```

- core/ **禁止 import** adapters/、ui/ 的任何文件
- ui/ **禁止直接调用**适配器（mqttGateway 等），必须通过 Service
- Service 依赖通过构造函数注入，不自行实例化适配器
- 新功能应通过配置/策略扩展（OCP），不得修改 3+ 个文件

## SOLID 精简要求

1. **SRP**：一个文件只承担一个变化理由；Service 不得操作 DOM，View 不得写业务逻辑
2. **OCP**：新增设备/类型只改 entities/（或对应策略表），不改用例层
3. **LSP**：替换实现必须保持接口契约一致（方法名、参数、返回值）
4. **ISP**：构造函数按需注入最小依赖集，禁止注入大杂烩对象
5. **DIP**：依赖注入 + 面向接口约定，核心层不 import 任何外部实现

## 代码规范

- 文件顶部必须写层归属注释（参考现有文件头部格式）
- 命名：Service 类 PascalCase，View 工厂 `createXxx`，适配器 camelCase
- 禁止 magic number，提取为常量或配置
- 单函数控制在 50 行内，发现重复逻辑必须抽取
- 不写多余注释；注释说明"为什么"而非"是什么"

## 测试要求

- 纯函数（协议层）必须有单元测试
- 新增 Service 逻辑必须有集成测试（Mock 适配器接口）
- Mock 基于接口约定（`{ send: vi.fn() }`），禁止 mock 内部实现
- 测试名描述业务行为（如"相同请求共享轮询定时器"）
- 测试/构建必须全绿后才能完成任务

## 审查清单（提交前自查）

- [ ] 层归属正确？依赖方向无违反？
- [ ] 改动文件数最小（OCP）？
- [ ] 新代码有测试？全部测试通过？
- [ ] 无 console.log 残留、无 magic number、无重复逻辑？
