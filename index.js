const Config = require('./config');

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const os = require('os');
const fs = require('fs');
const axios = require('./axios');
const jsSHA = require('jssha');
const logger = require('morgan');
const moment  = require('moment');

// 全局定时器，定时获取access_token
global.uid = null;

// Create express instnace
// const app = express();
const app = require('./mp');

app.use(logger('dev'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const getCurrentTime = ()=> {
  return moment(new Date()).format('YYYY-MM-DD HH:mm:ss')
};

// 获取公众号access-token
function getMpAccessToken() {
  axios({
    url: 'https://api.weixin.qq.com/cgi-bin/token',
    method: 'GET',
    params: {
      grant_type: 'client_credential',
      appid: Config.mp.appId,
      secret: Config.mp.appSecret
    }
  }).then((res)=>{
    if (res.errcode) {
      console.log(getCurrentTime() + "：" + `获取access_token错误;${res.errmsg}`);
    } else {
      global.expiresTime = res.expires_in * 1000 + Date.now();
      global.accessToken = res.access_token;
      console.error(getCurrentTime() + "：" + `公众号accessToken：${res.access_token}`);
      getMpTicket(global.accessToken);
    }
  }).catch((err)=>{
    console.error(getCurrentTime() + " 获取公众号access_token失败：");
    console.error(err)
  })
}

// 公众号根据accssToken获取jsapi_ticket
function getMpTicket(access_token) {
  axios({
    url: 'https://api.weixin.qq.com/cgi-bin/ticket/getticket',
    method: 'GET',
    params: {
      type: 'jsapi',
      access_token: access_token
    }
  }).then((res)=>{
    if (res.errcode) {
      console.error(getCurrentTime() + "：" + `获取jsapi_ticket错误：;${res.errmsg}`);
    } else {
      console.log(getCurrentTime() + "：" + '微信公众号ticket：' + res.ticket);
      global.ticket = res.ticket;
      global.expires_in = res.expires_in
    }
  }).catch((err)=>{
    console.error(getCurrentTime() + "：" + '获取jsapi_ticket错误：');
    console.error(err)
  })
}

// 校验是否已缓存access_token
function judgeAccessToken() {
  // access_token过期时间
  let timestamp = Date.now();
  if (global.expiresTime) {
    if (timestamp < global.expiresTime && global.accessToken) {
      return global.accessToken;
    }
  }
  return false;
}

/*
* @Params(code)
* 获取网页授权access_token
* 注意：此access_token只用于网页授权，和global.access_token非同一token
* */
async function getAuthAccessToken(code) {
  return axios({
    url: 'https://api.weixin.qq.com/sns/oauth2/access_token',
    method: 'GET',
    params: {
      appid: Config.mp.appId,
      secret: Config.mp.appSecret,
      code: code,
      grant_type: 'authorization_code'
    }
  })
}

/*
* 根据getAuthAccessToken方法获取的access_token获取用户信息
* */
function getUserInfo({ access_token, openId, lang }) {
  return axios({
    url: 'https://api.weixin.qq.com/sns/userinfo',
    method: 'GET',
    params: {
      access_token: access_token,
      openId: openId,
      lang: lang || 'zh_CN'
    }
  })
}

const raw = function (args) {
  let keys = Object.keys(args);
  keys = keys.sort();
  let newArgs = {};
  keys.forEach(function (key) {
    newArgs[key.toLowerCase()] = args[key];
  });

  let string = '';
  for (let k in newArgs) {
    string += '&' + k + '=' + newArgs[k];
  }
  string = string.substr(1);
  return string;
};


const decode = (bytes)=>{
  let bString = "";
  for(let i = 0, len = bytes.length; i < len; ++i){
    bString+= String.fromCharCode(bytes[i]);
  }
  return (bString);
};

// 通过微信code登录
async function wxLogin(req, res) {
  let code = req.query.code;
  // 获取openId
  let result = await getAuthAccessToken(code).catch((err)=>{
    // 调用失败
    console.error(getCurrentTime() + " 获取opendId失败：");
    console.error(err);
    res.redirect('/login-error');
  });
  let openId = result.openid;
  if (openId) {
    let token = 'token';
    res.cookie('token', token,{ maxAge: 1000 * 60 * 60 * 24 * 7 }); // 存储客户端cookie-有效期以毫秒为单位
    let url = "/"; // 需配置的重定向页面路径
    res.redirect(url);
    /* 微信接口成功的业务逻辑 */
  } else {
    console.error(getCurrentTime() + "：" + '获取openId失败：');
    console.error(result.data);
    res.redirect('/login-error');
  }
}

// 定时获取公众号access_token
getMpAccessToken();
global.uid = setInterval(()=>{
    getMpAccessToken();
}, 7200 * 1000 - 1000);

// 微信内网页获取签名信息接口
app.get('/api/weixin/mp-sign', (req, res, next)=>{
  if(!req.query.url) {
    res.send({
      success: false,
      errorMsg: '缺少url参数'
    });
    return;
  }

  let obj = {
    jsapi_ticket: global.ticket,
    noncestr: Math.random().toString(36).substr(2), // 随机字符串
    timestamp: parseInt(new Date().getTime() / 1000) + '',
    url: req.query.url,
  };

  let string = raw(obj);
  let shaObj = new jsSHA(string, 'TEXT');
  let signature = shaObj.getHash('SHA-1', 'HEX');

  res.send({
    success: true,
    data: {
      timestamp: obj.timestamp,
      nonceStr: obj.noncestr,
      signature: signature,
      expires_in: global.expires_in, // 有效期
      url: obj.url,
      appId: Config.mp.appId
    }
  });
});

/*
* 公众号验证消息接口
* */
app.get("/api/weixin/news", (req, res, next)=>{
  res.send(req.query.echostr);
});

function redirectWXLogin (res, type) {
  // 跳转至公众号微信授权登录界面
  let REDIRECT_URI = `${Config.mp.site}/api/weixin/login`;
  let url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${Config.mp.appId}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=snsapi_base&state=STATE#wechat_redirect`;
  res.redirect(url);
}

// 微信重定向login页面，使页面带入token
app.get('/api/weixin/login', async (req, res, next)=>{
  let token = req.cookies.token || req.query.token || req.headers.token;
  if (!token) {
    // 未登录
    await wxLogin(req, res);
    return;
  }
  let url = "/"; // 需配置的重定向页面路径
  res.redirect(url);
});

app.disable('x-powered-by');

app.use(function(err, req, res, next) {
  console.error(getCurrentTime() + " 未知错误：" + err);
  // render the error page
  res.status(err.status || 500);
});

app.listen(Config.port);