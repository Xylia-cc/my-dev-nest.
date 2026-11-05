#!/bin/bash
# 局域网分享服务：启动后同网段同事可访问
cd "$(dirname "$0")/../site" || exit 1
IP=$(node -e "const os=require('os');const n=os.networkInterfaces();Object.keys(n).forEach(k=>n[k].forEach(x=>{if(x.family==='IPv4'&&!x.internal)console.log(x.address);}))" | head -1)
echo "============================================"
echo " 局域网分享地址：http://$IP:8899/"
echo " （本机需保持开机，同事需在同一网络）"
echo " 按 Ctrl+C 停止服务"
echo "============================================"
python -m http.server 8899 --bind 0.0.0.0
