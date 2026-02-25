# 飞书应用权限配置清单

## 应用信息
- **App ID**: `cli_a9f68bf64bf9dbde`
- **App Secret**: `Blvo5l76nUkYvcyqw5YfPcdUD1GBYebi`
- **管理后台**: https://open.feishu.cn/app/cli_a9f68bf64bf9dbde

## 需要添加的权限（Scopes）

### 1. 消息相关（必需）
- ✅ `im:message` - 获取与发送单聊、群组消息
- ✅ `im:message:send_as_bot` - 以应用的身份发送消息
- ✅ `im:message.group_msg` - 接收群组中@机器人的消息
- ✅ `im:message.p2p_msg` - 接收单聊消息

### 2. 用户信息（必需 - 当前缺失）
- ❌ `contact:user.employee_id:readonly` - 读取通讯录用户基本信息
- ❌ `contact:user.base:readonly` - 读取用户基本信息

### 3. 语音消息相关
- ✅ `im:file` - 上传文件到飞书
- ✅ `im:resource` - 访问消息中的资源文件

### 4. 其他推荐
- `im:chat` - 获取群组信息
- `im:chat:readonly` - 查看群组信息

## 配置步骤

1. 访问：https://open.feishu.cn/app/cli_a9f68bf64bf9dbde/permissions
2. 找到 **权限管理** 页面
3. 添加上述缺失的权限（标记 ❌ 的）
4. 点击 **申请权限** / **保存**
5. 如果需要审批，联系管理员
6. 权限生效后，重启 Clawdbot：`openclaw-cn gateway restart`

## 测试命令

权限添加后，运行测试：
```bash
node /tmp/test-feishu-voice.js
```

应该看到：
```
✅ Token 获取成功
✅ 文件上传成功
✅ 语音消息发送成功！
```

## 常见问题

**Q: 权限申请后还是报错？**
A: 等待 1-2 分钟让权限生效，或重启应用

**Q: 需要管理员审批怎么办？**
A: 联系你的飞书管理员批准权限申请

**Q: 能否跳过权限直接发送？**
A: 不行，飞书 API 严格检查权限

---

**提示**: 添加权限后告诉我，我会立即测试语音发送！
