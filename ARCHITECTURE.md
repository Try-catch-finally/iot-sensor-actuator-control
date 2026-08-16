# SOLID 原则与整洁架构规范

> 适用于 JavaScript / TypeScript 项目的通用架构标准。

---

## 一、整洁架构分层（四层模型）

```
┌─────────────────────────────────────────────────┐
│                 表现层（UI / CLI）               │
│         视图、路由、控制器、表单处理              │
├─────────────────────────────────────────────────┤
│                 用例层（Use Cases）              │
│         业务服务、流程编排、事件调度              │
├─────────────────────────────────────────────────┤
│                 适配器层（Adapters）             │
│         外部 API、数据库、消息队列、文件系统      │
├─────────────────────────────────────────────────┤
│                 实体层（Entities）               │
│         数据模型、业务规则、配置常量              │
└─────────────────────────────────────────────────┘
```

### 依赖方向（唯一规则）

```
表现层 → 用例层 → 适配器层 → 实体层
（允许跳层：表现层可直接引用实体层）
（禁止反向：用例层不得 import 表现层或适配器层）
```

### 目录结构模板

```
src/
├── core/               ← 用例层：业务逻辑
├── adapters/           ← 适配器层：外部 I/O
├── entities/           ← 实体层：数据模型与规则
└── main.js             ← 装配根：唯一允许跨层 import 的入口
```

### 各层职责

| 层 | 职责 | 变化理由 | 测试方式 |
|---|---|---|---|
| 表现层 | 渲染 UI、处理用户输入 | 交互方式变更 | E2E / CDP 截图 |
| 用例层 | 编排业务流程、调度服务 | 业务规则变更 | 集成测试（Mock 适配器） |
| 适配器层 | 封装外部依赖的读写 | 外部 API / 存储变更 | 不测试（外部库封装） |
| 实体层 | 定义数据结构与常量 | 业务模型变更 | 单元测试（纯函数） |

---

## 二、SOLID 原则

### S — 单一职责原则（SRP）

**定义**：一个模块只因**一个原因**而变化。

**判断方法**：用一句话描述模块职责，如果用了"并且"，说明职责不单一。

```js
// ❌ 两个职责
class SensorService {
    handleData(data) { ... }   // 业务逻辑
    renderCard(data) { ... }   // UI 渲染
}

// ✅ 各自单一
class SensorService {
    handleData(data) { ... }   // 只管业务
}
function renderSensorCard(data) { ... }  // 只管渲染
```

**实际影响**：职责不单一 → UI 改版时必须改业务代码，业务逻辑变更时必须改渲染代码。

---

### O — 开闭原则（OCP）

**定义**：对**扩展**开放，对**修改**关闭。新增功能时不应修改已有代码。

**判断方法**：新功能是否只新增文件/配置，而不改动已有模块？

```js
// ❌ 每新增一种传感器都要改 Service
class SensorService {
    handle(type, data) {
        if (type === 'light') { ... }
        else if (type === 'temp') { ... }   // 新增 type 就要加分支
    }
}

// ✅ 通过配置扩展，无需改 Service
const extractors = {
    light: (data) => data[0],
    temp: (data) => data[1] * 0.1,
    // 新增类型只需在这里加一行
};
```

**实际影响**：违反 OCP → 新增一个传感器型号需要改 Service + View + Config，改动面过大。

---

### L — 里氏替换原则（LSP）

**定义**：子类型必须可替换父类型，且不影响程序正确性。

**在 JS 中的体现**：接口契约的一致性（JS 没有 `interface`，但约定相同）。

```js
// ✅ 替换任一实现后，调用方无需修改
const cacheA = { get: (key) => ..., set: (key, val) => ... };
const cacheB = { get: (key) => ..., set: (key, val) => ... };
// 两个实现共享相同的 .get() / .set() 契约
```

**检验方法**：如果替换一个实现后，调用方需要修改调用方式，LSP 不达标。

---

### I — 接口隔离原则（ISP）

**定义**：消费者不应被迫依赖它不使用的接口。

**在 JS 中的体现**：构造函数参数按需注入，不要提供"大杂烩"对象。

```js
// ❌ 所有服务都注入完整对象，即使只用其中一个方法
new Service({ mqtt, storage, emitter, logger, router, modals });

// ✅ 只注入需要的能力
new SensorService({ mqtt, storage, emitter });
new SceneService({ actuatorService, emitter });  // 不需要 mqtt
```

**实际影响**：违反 ISP → 测试时必须 mock 一大堆用不到的东西，改一个接口影响所有消费者。

---

### D — 依赖倒置原则（DIP）

**定义**：高层模块不依赖低层模块，二者都依赖**抽象**（接口约定）。

**在 JS 中的体现**：依赖注入 + 面向接口编程。

```js
// ✅ 高层（用例层）只依赖接口约定，不 import 具体实现
class SensorService {
    constructor({ mqtt, storage }) {
        // 只使用 mqtt.send() / mqtt.isConnected()
        // 不关心 mqtt 具体是 MQTT 还是 WebSocket
    }
}

// ✅ 实际实现在装配根中注入
const mqtt = new MqttGateway();
new SensorService({ mqtt, storage });
```

**核心规则**：核心层**永远不 import** 适配器层或表现层。依赖方向只能从外向内。

---

## 三、装配根（Composition Root）

### 职责

装配根是**唯一允许跨层 import 的文件**，负责：
1. 创建事件总线
2. 创建适配器实例
3. 创建用例层服务（注入适配器）
4. 创建表现层视图（注入服务引用或回调）
5. 接线事件分发

### 模板

```js
// main.js — 装配根
import { EventBus } from './core/eventBus.js';
import { MqttAdapter } from './adapters/mqtt.js';
import { StorageAdapter } from './adapters/storage.js';
import { UserService } from './core/userService.js';
import { UserView } from './ui/userView.js';

const bus = new EventBus();
const mqtt = new MqttAdapter({ onMessage: handleMessage });
const storage = new StorageAdapter();

const userService = new UserService({ mqtt, storage, bus });
const userView = new UserView({ service: userService, bus });

function handleMessage(hex) {
    const result = parseProtocol(hex);
    userService.handleResponse(result);
}

userService.loadFromCache();
mqtt.connect();
```

### 禁止事项

| 禁止 | 原因 | 修正 |
|---|---|---|
| 用例层 `import` 适配器层 | 违反 DIP，无法替换适配器 | 通过构造函数注入 |
| 用例层 `import` 表现层 | 违反 SRP，业务依赖 UI | 通过事件通知 UI |
| 表现层直接调用 `mqtt.send()` | 绕过业务层，逻辑分散 | 调用 Service 方法 |

---

## 四、服务间通信

### 通信方式选择

| 场景 | 方式 | 原因 |
|---|---|---|
| 一对多广播（UI 监听数据变化） | 事件总线 `bus.emit('data-updated', payload)` | 解耦，多消费方无需互相知道 |
| 点对点调用（删除确认） | 回调注入 `onRemove(id)` | 只有一个消费方，直接回调更清晰 |
| 跨服务协调（A 服务触发 B 服务） | 依赖注入 | 由装配根注入，避免循环依赖 |

### 事件总线规范

```js
// ✅ 事件名用 kebab-case，描述发生了什么（过去式）
bus.emit('user-created', { id, name });
bus.emit('data-synced', { count });

// ❌ 事件名用命令式或含义模糊
bus.emit('createUser', ...);  // 是"要创建"还是"已创建"？
bus.emit('update', ...);       // 更新什么？
```

### 回调注入规范

```js
// ✅ 回调名描述意图，参数明确
new UserView({
    onRemove: (id) => userService.remove(id),
    onToggle: (id) => userService.toggle(id),
});

// ❌ 回调名模糊或参数不明确
new UserView({
    handler: fn,        // 什么 handler？
    cb: (a, b) => ...,  // a 是什么？b 是什么？
});
```

---

## 五、命名与文件规范

### 文件命名

| 类型 | 规范 | 示例 |
|---|---|---|
| Service 类 | `xxxService.js`（PascalCase 类名） | `userService.js` |
| View 工厂 | `xxxView.js`（camelCase 导出函数） | `userView.js` |
| 适配器 | `camelCase.js`（小写开头） | `mqttGateway.js` |
| 纯工具函数 | 描述性名词 | `format.js`、`validator.js` |
| 事件总线 | `eventBus.js` 或 `emitter.js` | — |

### 导出规范

| 场景 | 导出方式 | 示例 |
|---|---|---|
| 有状态服务 | `export class XxxService` | `UserService` |
| 无状态工厂 | `export function createXxx()` | `createUserView` |
| 纯函数集 | `export function xxx()` | `formatDate`、`calculateCRC` |
| 配置/常量 | `export const XXX` | `DEFAULT_CONFIG` |
| 适配器 | `export function xxx()` / `export default` | 各函数独立导出 |

### 文件头注释

每个文件顶部必须有块注释：

```js
// ============================================================================
// 层归属：用例层
// 职责：用户注册与认证流程
// 依赖：mqttAdapter（发送）、storageAdapter（持久化）、eventBus（通知）
// ============================================================================
```

---

## 六、测试规范

### 测试金字塔

```
        ╱╲
       ╱ E2E╲         ← 真实环境（浏览器 CDP / API 调用）
      ╱──────╲
     ╱ 集成测试 ╲      ← 服务 + Mock 依赖
    ╱────────────╲
   ╱   单元测试    ╲    ← 纯函数、纯逻辑
  ╱──────────────────╲
```

### 各层测试要求

| 层 | 测试类型 | Mock 策略 | 示例 |
|---|---|---|---|
| 用例层 | 集成测试 | Mock 适配器接口 | Service 方法调用、事件发布 |
| 适配器层 | 不测试 | — | 外部库封装，依赖运行环境 |
| 实体层 | 单元测试 | 无需 mock | 纯函数计算、数据验证 |
| 表现层 | 不测试 | — | 通过 E2E / 截图验证 |

### Mock 原则

```js
// ✅ 正确：Mock 适配器接口（对象替换）
const mockMqtt = { isConnected: () => true, send: vi.fn() };
const service = new UserService({ mqtt: mockMqtt, storage: mockStorage });

// ❌ 错误：Mock 内部实现细节
vi.mock('../core/protocol.js', () => ({ parse: vi.fn() }));
```

### 命名规范

```js
// ✅ 描述业务行为
it('用户注册成功后自动发送欢迎邮件', () => { ... });
it('缓存过期时重新从服务器获取', () => { ... });

// ❌ 描述实现细节
it('test register function', () => { ... });
it('should call sendEmail once', () => { ... });
```

---

## 七、代码审查清单

### 架构合规性（必须）

- [ ] 新文件是否放在正确的层目录？
- [ ] 用例层是否 import 了适配器层或表现层？（**禁止**）
- [ ] 表现层是否直接调用了适配器层？（**禁止**，应通过用例层）
- [ ] 服务依赖是否通过构造函数注入？
- [ ] 新功能是否只改动了 1-2 个文件？（OCP 检验）

### 代码质量（必须）

- [ ] 是否有硬编码的 magic number？（应提取为常量）
- [ ] 函数是否超过 50 行？（应拆分）
- [ ] 是否有重复逻辑？（应提取为共享函数）
- [ ] 是否有 `console.log` 残留？（应用 `console.error` 或移除）

### 测试覆盖（必须）

- [ ] 纯函数是否有单元测试？
- [ ] 新 Service 是否有集成测试？
- [ ] 测试名是否描述业务行为？
- [ ] Mock 是否基于接口约定而非实现细节？

---

## 八、常见违反场景

| 违反 | 后果 | 修正 |
|---|---|---|
| 用例层直接操作 DOM | 无法单元测试，UI 变更波及业务 | 通过事件通知表现层 |
| 表现层直接调用适配器 | 无法替换外部依赖，逻辑分散 | 表现层 → 用例层 → 适配器层 |
| 两个服务互相 import | 循环依赖，无法独立测试 | 通过事件总线或注入解耦 |
| 新增功能改了 3+ 个文件 | OCP 失败，改动面过大 | 配置驱动或策略模式 |
| 所有服务注入同一个大对象 | ISP 失败，测试 mock 复杂 | 按需注入最小依赖集 |

---

## 九、扩展指南

### 新增业务类型

```
1. entities/：添加新类型配置 + 业务规则
2. 无需改动用例层或表现层
```

### 新增外部依赖

```
1. adapters/：新建适配器封装
2. 装配根：替换注入的适配器实例
3. 无需改动用例层或表现层
```

### 新增业务流程

```
1. core/：新建 Service 或扩展现有 Service
2. 装配根：注入依赖
3. 无需改动适配器层
```

---

*本规范基于整洁架构的"依赖规则"与 SOLID 原则，适用于任何 JavaScript / TypeScript 项目。所有新增代码应符合本规范，违反时必须在 Code Review 中指出并修正。*
