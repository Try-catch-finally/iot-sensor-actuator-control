# 测试设计文档

## 一、测试策略

项目遵循**测试金字塔**原则，将测试重点放在可独立验证的纯逻辑层：

```
        ╱╲
       ╱ E2E╲         ← 浏览器 CDP 实测（MQTT 真实连接 + 截图验证 UI）
      ╱──────╲
     ╱ 集成测试 ╲      ← 用例层 Service + Mock 适配器（Vitest）
    ╱────────────╲
   ╱   单元测试    ╲    ← 协议层纯函数（无副作用、无需 Mock）
  ╱──────────────────╲
```

## 二、测试分布

| 测试文件 | 覆盖对象 | 用例数 | 类型 |
|---|---|---|---|
| `tests/modbus.test.js` | 协议层纯函数 | 35 | 单元测试 |
| `tests/sensorService.test.js` | 传感器用例层 | 13 | 集成测试 |
| `tests/sceneService.test.js` | 场景联动用例层 | 21 | 集成测试 |
| **合计** | | **69** | 全绿 |

## 三、单元测试：协议层（modbus.test.js）

覆盖 `src/core/modbus.js` 的纯函数，**无需任何 Mock**：

- **CRC16 计算**：标准向量验证（`030300000002 → C5E9`）
- **读命令构建**：各功能码 + 起始地址 + 寄存器数量
- **写命令构建**：单个线圈/寄存器、多个线圈/寄存器，开/关两种状态
- **帧解析**：保持寄存器、输入寄存器、线圈位图、写确认、异常响应
- **错误处理**：数据长度不足、长度不匹配
- **粘包解码器**（`ModbusFrameDecoder`）：
  - 单帧 / 多帧粘包（一条消息含 2 帧）
  - 拆包（半帧分多次到达、跨消息拼接）
  - 异常帧、噪音字节滑动恢复
  - CRC 错误帧丢弃
  - 超过 512 字节的无效数据自动清理

## 四、集成测试：用例层（sensorService / sceneService）

通过**接口约定 Mock** 适配器，验证业务行为：

```js
// Mock 基于接口约定，而非内部实现
const mockMqtt = { isConnected: () => true, send: vi.fn() };
const service = new SensorService({ mqttGateway: mockMqtt, storage: mockStorage, emitter: bus });
```

### SensorService（13 例）

- 添加/删除传感器、去重
- 相同请求配置共享轮询定时器，移除最后一个使用方后停止
- 读响应分发到匹配的传感器（按从机 + 功能码）
- 值提取与事件发布
- 异常响应匹配（功能码掩码还原）
- 缓存持久化与恢复

### SceneService（21 例）

- 场景添加/删除/启用切换
- 触发条件判定（大于/小于/等于、启用状态）
- 条件满足时调用执行器动作
- 条件不满足时不触发
- 描述文本生成（条件 + 动作）

## 五、Mock 原则

```js
// ✅ 正确：Mock 适配器接口（对象替换）
const mockMqtt = { isConnected: () => true, send: vi.fn() };

// ❌ 错误：Mock 内部实现细节
vi.mock('../core/modbus.js', () => ({ buildReadCommand: vi.fn() }));
```

## 六、测试命名规范

```js
// ✅ 描述业务行为
it('相同请求配置的传感器共享轮询定时器', () => { ... });
it('条件满足时触发执行器动作', () => { ... });

// ❌ 描述实现细节
it('test the function', () => { ... });
```

## 七、运行

```bash
npm test          # 全部测试
npm run check     # 测试 + 构建
```