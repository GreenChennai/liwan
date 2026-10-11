# 为严格 NAT 后的协作自托管 TURN 服务器（coturn）

Liwan 的实时协作（Docs/白板邀请链接、Sheets/Slides 在线状态）**默认采用直连点对点 WebRTC**——参见 [COLLABORATION.md](COLLABORATION.md) §3。无需任何 Vulos 产品、主机盒子或账户即可实现：传输层是 Liwan 自有的第一方 `FabricClient`（`src/lib/collab/webrtc/fabric.js`）。

直连 WebRTC 需要帮助才能穿越 NAT：

- **STUN** 在绝大多数情况下就足够了——它只是告诉对端自己的公网可见地址，使双方可以打洞直接相连。Liwan 默认使用公共的 Google STUN 服务器，无需任何设置；你也可以通过 `collab.ice.stun_urls`（运行时）或 `VITE_STUN_URLS`（构建时）改为指向你自己的 STUN 服务器——参见 [CONFIGURATION.md](CONFIGURATION.md)。
- **TURN** 仅在打洞彻底失败时才需要——最常见的情况是某一端位于**对称型 NAT**之后（在某些企业/移动网络和运营商级 NAT 中很常见）。TURN 会在两个对等方之间中继流量，而不是让它们直接相连。在 Liwan 的模型中，这种中继仍然是**内容盲的**：负载在到达 TURN 服务器之前，就已经被邀请链接的房间密钥进行了端到端封装（参见 [COLLABORATION.md](COLLABORATION.md) §4）——TURN 只是转发它无法读取的字节。

本文档讨论的是第二种情况：运行你**自己的** TURN 服务器（[coturn](https://github.com/coturn/coturn)），并将 Liwan 指向它，使得对等方位于严格 NAT 之后的部署无需依赖任何其他 Vulos 产品（主机盒子或 `vulos-relayd`）即可获得中继回退。

## 你真的需要它吗？

先不使用 TURN 进行尝试。对于绝大多数网络而言，仅 STUN 就已足够。只有当你发现协作者在你无法控制的网络上（例如一方或双方位于酒店/移动/企业 NAT 之后）反复卡在“连接中”的在线状态标签、始终无法达到“Live”时，才需要部署 coturn。`docs/TROUBLESHOOTING.md` 中提供了通用的连通性检查清单。

## 1. 安装 coturn

### 方案 A — apt（Debian/Ubuntu）

```sh
sudo apt update
sudo apt install -y coturn

# 启用 systemd 服务（Debian/Ubuntu 软件包默认禁用）。
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

编辑 `/etc/turnserver.conf`（替换软件包自带的配置），使用第 2 步中的最小配置，然后：

```sh
sudo systemctl restart coturn
sudo systemctl enable coturn
sudo journalctl -u coturn -f   # 测试时实时查看日志
```

### 方案 B — Docker

```sh
mkdir -p ~/coturn && cd ~/coturn
# 将第 2 步中的 turnserver.conf 保存为 ./turnserver.conf，然后：

docker run -d --name coturn --restart unless-stopped \
  --network host \
  -v "$PWD/turnserver.conf:/etc/coturn/turnserver.conf:ro" \
  coturn/coturn -c /etc/coturn/turnserver.conf
```

`--network host` 很重要：coturn 需要绑定一个**较宽的 UDP 端口范围**用于实际的媒体/数据中继（参见下面的 `min-port`/`max-port`），而 Docker 默认的桥接网络需要逐个发布这些端口。主机网络是在容器中运行 coturn 的标准做法。

## 2. 最小可用的 `turnserver.conf`

```ini
# coturn 所宣告的 realm——任何稳定的名称都可以；客户端不需要与某个 DNS 区域匹配，
# 但惯例上会使用一个域名。
realm=turn.example.org

# 标准 TURN/STUN 端口。
listening-port=3478
tls-listening-port=5349

# 用于 turns:// 的 TLS 证书（任何公网部署都建议配置——某些企业代理可能无法可靠地访问未加密的 turn:// 中继，
# 而且这样可以避免凭据以明文形式在网络上传输）。
cert=/etc/letsencrypt/live/turn.example.org/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.org/privkey.pem

# 实际的中继端口范围（coturn 为每个会话分配的、用于承载中继媒体/数据的 UDP 端口）。
# 请保持合理的规模——每个并发中继会话在其生命周期内会占用该范围内的一个端口。
min-port=49152
max-port=49452

# 必需：服务器自身的公网 IP，使 coturn 宣告一个可访问的中继候选地址，而不是私有/NAT 后的地址。
# 如果 coturn 位于其自身的 NAT 之后（例如同时拥有私有和公网 IP 的云虚拟机），请改用
# "私有IP/公网IP" 的形式：
#   external-ip=203.0.113.10/10.0.0.5
external-ip=203.0.113.10

# 长期凭据机制——凭据设置的两种方式见第 3 步，它们分别与 VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL 配对。
lt-cred-mech

# 静态凭据（最简单——请选择一个强的随机密码）：
user=liwan:CHANGE_ME_TO_A_LONG_RANDOM_SECRET

# 推荐的加固选项。
fingerprint
no-multicast-peers
no-cli
# 拒绝向你自己私有网络中的地址进行中继（SSRF 防护——防止恶意对等方利用你的 TURN 服务器访问你的局域网）。
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
```

### 静态凭据 vs. 限时凭据

上面的配置使用的是 `user=liwan:CHANGE_ME_TO_A_LONG_RANDOM_SECRET`——单一的静态用户名/密码对。这是最简单的选择，对于你自己控制谁能获得凭据的自托管部署来说是可行的（它会直接写入 `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`——见第 3 步）。不过它是一个共享密钥：任何持有它的人都可以无限期地通过你的服务器中继。

对于公开的多租户部署，coturn 还支持基于 `static-auth-secret` 派生的**限时凭据**（对 `<unix-timestamp>:<username>` 做 HMAC-SHA1），这些凭据会自动过期：

```ini
use-auth-secret
static-auth-secret=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
```

为每个会话签发新的限时凭据需要一点服务端代码（Liwan 目前不会生成这些凭据——当前受支持的路径是上面的静态 `lt-cred-mech` 凭据）。如果你以后想添加该功能，具体的 HMAC 方法请参阅 coturn 自己的 [`README.turnserver`](https://github.com/coturn/coturn/blob/master/README.turnserver)。

## 3. 防火墙

至少需要开放：

| 端口 | 协议 | 用途 |
|---------|----------|---------|
| 3478 | UDP + TCP | STUN/TURN 控制（`listening-port`） |
| 5349 | UDP + TCP | 基于 TLS 的 STUN/TURN 控制（`tls-listening-port`） |
| 49152–49452（或你设置的范围） | UDP | 实际的中继流量（`min-port`–`max-port`） |

```sh
# ufw 示例
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:49452/udp
```

如果 coturn 位于云服务商自己的安全组/防火墙（AWS、Hetzner 等）之后，也请在那里开放相同的端口——仅靠操作系统防火墙是不够的。

## 4. 将 Liwan 指向它

### 方案 A — 在运行中的服务器上配置（推荐；适用于发布版二进制文件）

配置服务器并重启。浏览器会从 `GET /api/rendezvous/ice` 获取这些配置，因此**无需重新构建前端**——这使得即使你下载的是发布版二进制文件或拉取的是容器镜像，也能使用：

```yaml
# config.yaml
collab:
  ice:
    stun_urls: ["stun:turn.example.org:3478"]
    turn_urls: ["turn:turn.example.org:3478", "turns:turn.example.org:5349"]
    turn_secret: "CHANGE_ME_TO_A_LONG_RANDOM_SECRET"   # coturn 的 static-auth-secret
    turn_ttl_seconds: 3600
```

或者完全通过环境变量配置：

```sh
export VULOS_STUN_URLS="stun:turn.example.org:3478"
export VULOS_TURN_URLS="turn:turn.example.org:3478,turns:turn.example.org:5349"
export VULOS_TURN_SECRET="CHANGE_ME_TO_A_LONG_RANDOM_SECRET"
```

**优先使用 `turn_secret`，而非静态用户名/密码。** 它是 coturn 的 REST API（`static-auth-secret`）模式：密钥永远不会离开服务器，每次响应都会携带一个在 `turn_ttl_seconds` 后过期的用户名/凭据对。ICE 端点由于必要性而不需要认证——浏览器在拥有会话之前就需要 ICE 服务器——因此如果把长期有效的凭据放在那里，任何能访问该机器的人都可以读取；而签发的凭据在一小时内即失效。如果你没有 REST 密钥，也支持 `turn_username` / `turn_credential`，并会原样提供。

要使用 REST 模式，coturn 需要 `use-auth-secret` 而不是 `lt-cred-mech`：

```conf
use-auth-secret
static-auth-secret=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
realm=turn.example.org
```

验证服务器下发的内容：

```sh
curl -s http://localhost:8080/api/rendezvous/ice
# {"ice_servers":[{"urls":["stun:…"]},{"urls":["turn:…"],"username":"1800003600","credential":"…","ttl":3600}]}
```

### 方案 B — 在前端构建时配置

`VITE_*` 变量会被打包进前端产物，因此需要重新构建——如果你自己构建前端，这样做没有问题：

```sh
export VITE_TURN_URL="turn:turn.example.org:3478,turns:turn.example.org:5349"
export VITE_TURN_USERNAME="liwan"
export VITE_TURN_CREDENTIAL="CHANGE_ME_TO_A_LONG_RANDOM_SECRET"   # 与上面的 user= 相匹配

npm run build:frontend
```

此处 `VITE_STUN_URLS` 是可选的——默认的公共 Google STUN 已经覆盖了 STUN 部分；只有当你也想使用自己的 STUN 服务器时才需设置（例如 `turn:turn.example.org:3478` 本身也可以在无凭据的情况下充当 STUN 服务器）。

### 方案 C — 由宿主页面注入

如果一个页面托管了 Liwan，并希望在运行时提供这些配置，可以在打包产物加载之前这样做：

```html
<script>
  window.__VULOS_ENDPOINTS__ = {
    turn: { urls: ['turn:turn.example.org:3478'], username: 'liwan', credential: '…' },
  }
</script>
```

当服务器响应（方案 A）非空时，使用服务器响应；否则浏览器依次回退到方案 C、方案 B，最后是仅 STUN。

## 5. 验证

```sh
# coturn 自带的连通性检查（需要 `turnutils_uclient` 工具，随 coturn 软件包一同提供）：
turnutils_uclient -T -u liwan -w 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET' turn.example.org

# 在浏览器中访问 https://icetest.info 或 https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
# ——将 "TURN URI" / 用户名 / 凭据设置为你的值，并确认收集到了 "relay" 候选项（而不仅仅是 "srflx"/"host"）。
```

在 Liwan 中：在位于两个不同严格 NAT 之后的浏览器上打开 DevTools → Network，启动一个协作会话，并确认在线状态标签进入“Live”——如果 `chrome://webrtc-internals`（或 Firefox 中的 `about:webrtc`）显示活动候选对为 `relay`，则说明是 TURN 完成了 STUN 无法完成的工作。

## 参考

- coturn 项目：<https://github.com/coturn/coturn>
- Liwan 的 ICE 配置代码：`src/lib/collab/webrtc/call/ice.js`
- 回退 ICE 列表的使用方式：`src/lib/collab/webrtc/fabric.js`（`_fetchICE`）
- 更完整的协作/传输模型：[COLLABORATION.md](COLLABORATION.md) §3
- 运行时的 `collab.ice.*` 设置以及所有 `VITE_STUN_URLS`/`VITE_TURN_*` 变量：[CONFIGURATION.md](CONFIGURATION.md)
- ICE 端点的服务端实现：`backend/rendezvous/ice.go`
