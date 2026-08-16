// ============================================================================
// 适配器层：MQTT 网关（Paho 库封装）
// 职责：连接 / 发送 / 接收。协议解析与业务处理由外层通过回调注入
// 依赖方向：适配器 → 实体配置；不依赖 UI / 业务逻辑
// ============================================================================

import { mqttConfig } from '../entities/presets.js';
import { ModbusFrameDecoder, bytesToHex } from '../core/modbus.js';

export class MqttGateway {
    /**
     * @param {{onStatusChange:(status:string)=>void, onRawMessage:(hexData:string)=>void}} callbacks
     */
    constructor({ onStatusChange, onRawMessage }) {
        this.callbacks = { onStatusChange, onRawMessage };
        this.client = null;
        // MQTT 消息边界与 Modbus 帧边界不对应，需按帧拆包
        this.decoder = new ModbusFrameDecoder();
    }

    connect() {
        const Paho = window.Paho;
        if (!Paho) {
            this.callbacks.onStatusChange('连接失败：Paho 库未加载');
            return;
        }

        this.client = new Paho.MQTT.Client(
            mqttConfig.server,
            mqttConfig.port,
            'web_client_' + Math.random().toString(36).substr(2, 9)
        );

        this.client.onConnectionLost = (responseObject) => {
            if (responseObject.errorCode !== 0) {
                this.callbacks.onStatusChange(`连接丢失：${responseObject.errorMessage}`);
            }
        };

        this.client.onMessageArrived = (message) => {
            const frames = this.decoder.push(message.payloadBytes);
            frames.forEach((frame) => {
                this.callbacks.onRawMessage(bytesToHex(frame));
            });
        };

        this.client.connect({
            onSuccess: () => {
                this.callbacks.onStatusChange('已连接');
                this.client.subscribe(mqttConfig.subscribeTopic);
            },
            useSSL: mqttConfig.useSSL,
            userName: mqttConfig.username,
            password: mqttConfig.password
        });
    }

    isConnected() {
        return this.client !== null && this.client.isConnected();
    }

    /**
     * 发送 HEX 命令（原始字节载荷）
     * @param {string} hexCommand
     */
    send(hexCommand) {
        if (!this.isConnected()) return false;
        const clean = hexCommand.replace(/\s+/g, '');
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < clean.length; i += 2) {
            bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
        }
        const message = new Paho.MQTT.Message(bytes);
        message.destinationName = mqttConfig.publishTopic;
        this.client.send(message);
        return true;
    }
}
