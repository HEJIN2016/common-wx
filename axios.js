const axios = require('axios');

// 统一检查返回状态值
function checkStatus(response) {
  if (response.data.errcode === '42001') {
    return Promise.reject(response.data);
  } else {
    return response.data;
  }
}

axios.interceptors.response.use(response => {
  return checkStatus(response);
}, function (error) {
  if (error.response) {

  } else {
    console.log(JSON.stringify(error));
    console.error(error);
  }
  return Promise.reject(error);
});

module.exports = axios;
