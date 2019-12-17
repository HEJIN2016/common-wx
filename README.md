## common-wx

#### 用于微信公众号与小程序后台开发

#### 运行

```
# 安装依赖
npm install

#生产环境推荐使用pm2
普通运行： npm start
pm2运行：pm2 start npm --name "common-wx" --max-memory-restart 1024M -- run start

#运行地址
http://localhost:3000
```