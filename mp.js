const Config = require('./config');
const request = require('request');

const appId = Config.weapp.appId; // 小程序appId
const secret = Config.weapp.secret;

const express = require('express');
const os = require('os');
const fs = require('fs');

const axios = require('./axios');
const WXBizDataCrypt = require('./WXBizDataCrypt');
const jsSHA = require('jssha');

// 全局定时器，定时获取access_token
global.weappUid = null;

// Create express instnace
const app = express();

// 获取小程序accessToken
function getWEAPPToken(fn) {
  axios({
    url: 'https://api.weixin.qq.com/cgi-bin/token',
    method: 'GET',
    params: {
      grant_type: 'client_credential',
      appid: Config.weapp.appId,
      secret: Config.weapp.secret
    }
  }).then((res)=>{
    if (res.errcode) {
      console.log(`获取access_token错误;${res.data.errmsg}`);
    } else {
      global.weappExpiresTime = res.expires_in * 1000 + Date.now();
      global.weappAccessToken = res.access_token;
      console.log(`小程序accessToken：${res.access_token}`);
      if (fn) fn();
    }
  }).catch((err)=>{
    console.log(err);
  })
}

// 换取session_key
function codeSession ({appId, secret, code}) {
  return axios({
    url: `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`,
    method: 'GET'
  })
}

getWEAPPToken();
global.weappUid = setInterval(()=>{
  getWEAPPToken();
}, 7200 * 1000 - 1000);

// 获取小程序动态活码
app.get('/api/weixin/qrcode', (req, res, next)=>{
  let data = req.query;
  let result = {
    success: false
  };

  if (!data.path) {
    data.path = 'page/index/index'
  }
  request({
    method: 'POST',
    url: 'https://api.weixin.qq.com/wxa/getwxacode?access_token=' + global.weappAccessToken,
    body: JSON.stringify({
      path: decodeURIComponent(data.path),
      width: data.width || 430,
      is_hyaline: true
    })
  }).pipe(res);

});

// 小程序登录
app.post('/api/weixin/weapp-login', (req, res, nect)=>{
  let encryptedData = req.body.encryptedData;
  let code = req.body.code;
  let iv = req.body.iv;
  let result = {
    success: false,
    errorMsg: null
  };
  if (!encryptedData || !iv || !code) {
    result.errorMsg = '登录失败，参数错误';
    res.send(result);
    return;
  }
  let session_key;
  // 换取sessionKey
  codeSession({
    appId: appId,
    secret: secret,
    code: code,
  }).then((data)=>{
    session_key = data.session_key;
    if (!session_key) {
      res.send({
        success: false,
        errorMsg: 'code无效，无法获取session key',
        errorCode: '10029' // code无效
      });
    }
    let pc = new WXBizDataCrypt(appId, session_key);
    let decryptData = pc.decryptData(encryptedData, iv);
    result.success = true;
    result.data = decryptData;

    // 如果获取到unionId或openId，认为认证成功
    if (decryptData.unionId || decryptData.openId) {
      // 登录成功后的操作
    } else {
      console.log(decryptData);
      res.send({
        success: false,
        errorMsg: '登录失败，无法获取unionId或openId',
        errorCode: '10030' // code无效
      });
    }
  }).catch((err)=>{
    console.error(err);
    res.send({
      success: false,
      errorMsg: "微信授权失败"
    });
  })

});

module.exports = app;

