const axios = require('axios');
const { readFileSync, writeFileSync, ensureFileSync } = require('fs-extra');
const { join } = require('path');
const storagePathName = join(__dirname, './data.json');

let selectItem = null;

// 写入到json文件
function writeToJson(data) {
   writeFileSync(storagePathName, JSON.stringify(data));
}

// 读取json文件
function readFromJson() {
   ensureFileSync(storagePathName);
   const result = readFileSync(storagePathName, 'utf8');
   return result
      ? JSON.parse(result)
      : '';
}

function transform(value) {
   if (value > 0) {
      return {
         price: `+${value}%`,
         icon: './assets/up.png',
      }
   } else {
      return {
         price: `${value}%`,
         icon: './assets/down.png',
      }
   }
}

// 获取基金详情信息
async function getFundDetail(input) {
   try {
      const res = await axios({
         url: `http://fundgz.1234567.com.cn/js/${encodeURIComponent(input)}.js?rt=1463558676006`,
         method: "get",
      });
      let data = undefined;
      if (res.data.indexOf("{") !== -1) {
         data = JSON.parse(res.data.match(/({.*})/g)[0]);
      }
      if (data) {
         const transformObj = transform(data.gszzl);
         return {
            title: `${data.name}【${transformObj.price}】`,
            description: `当前净值估算：${data.gsz}\t昨日单位净值：${data.dwjz}`,
            url: `http://fund.eastmoney.com/${data.fundcode}.html?spm=search`,
            icon: transformObj.icon,
            code: data.fundcode,
         };
      }
   } catch (err) {
      return {
         title: `暂无查询结果`,
         msg: 'error',
      };
   }
}

// 获取所有基金列表
async function getFundFilterList(input) {
   let readData = readFromJson();
   // 判断缓存是否存在 及 是否过期
   if (!readData || readData.expires < Date.now()) {
      const res = await axios({
         url: `http://fund.eastmoney.com/js/fundcode_search.js`,
         method: "get",
      });
      readData = {
         expires: Date.now() + 1000 * 60 * 60 * 48,
         data: JSON.parse(res.data.match(/(\[.*\])/g)),
      };
      writeToJson(readData);
   }
   const filterList = readData.data.filter(val => val[2].indexOf(input) !== -1 || val[0] === input)
   return Promise.all(filterList.map(val => getFundDetail(val[0])));
}

// 获取指定基金列表
async function getFundSaveList(codeList) {
   return Promise.all(codeList.map(val => getFundDetail(val)));
}

// 请求入口
async function requestFundList(input) {
   const results = (await getFundFilterList(input)).filter(val => val && !val.msg);
   if (results.length) {
      return results;
   }
   return [{
      title: `暂无查询结果`,
      description: '请输入正确的基金代码或名称',
   }]
}

async function handleOutput(searchWord, callbackSetList) {
   if (searchWord) {
      callbackSetList([{
         title: '正在搜索中，请稍后',
         description: '如果长时间未加载列表，请重新尝试',
      }]);
      const results = await requestFundList(searchWord);
      callbackSetList(results);
   } else {
      callbackSetList([{
         title: '请输入基金名称或代码',
         description: '模糊搜索',
      }]);
   }
}

window.exports = {
   "utools-fund": {
      mode: "list",
      args: {
         enter: async (action, callbackSetList) => {
            callbackSetList([
               {
                  title: '我的自选加载中...',
               }
            ])
            const record = utools.db.get('attention.list');
            if (record && record.data && record.data.length) {
               callbackSetList(await getFundSaveList(record.data));
            } else {
               callbackSetList([
                  {
                     title: '你还未加入任何自选基金'
                  }
               ])
            }
         },
         search: async (action, searchWord, callbackSetList) => {
            if (!searchWord.includes('【')) {
               handleOutput(searchWord, callbackSetList);
            }
            if (!searchWord) {
               utools.redirect('懒人基金小助手');
            }
         },
         // 用户选择列表中某个条目时被调用
         select: (action, itemData, callbackSetList) => {
            const code = itemData.code
            const record = utools.db.get('attention.list');
            const data = record ? new Set(record.data) : new Set();
            const save = () => {
               if (record) {
                  utools.db.put({
                     _id: 'attention.list',
                     data: Array.from(data),
                     _rev: record._rev
                  })
               } else {
                  utools.db.put({
                     _id: 'attention.list',
                     data: Array.from(data)
                  })
               }
               utools.redirect('懒人基金小助手');
            }
            if (itemData.action) {
               switch (itemData.action) {
                  case 'save':
                     data.add(code)
                     save()
                     break
                  case 'remove':
                     data.delete(code)
                     save()
                     break
                  case 'open':
                     window.utools.hideMainWindow()
                     require('electron').shell.openExternal(itemData.url)
                     // 保证网页正常跳转再关闭插件
                     setTimeout(() => {
                        window.utools.outPlugin()
                     }, 500);
                     break
               }
            } else {
               utools.setSubInputValue(itemData.title)
               let renderList = []
               if (data && data.has(code)) {
                  renderList.push({
                     title: '打开详情',
                     action: 'open',
                     url: itemData.url,
                     code
                  })
                  renderList.push({
                     title: '移出自选',
                     action: 'remove',
                     code
                  })
               } else {
                  renderList.push({
                     title: '加入自选',
                     action: 'save',
                     code
                  })
                  renderList.push({
                     title: '打开详情',
                     action: 'open',
                     url: itemData.url,
                     code
                  })
               }
               callbackSetList(renderList)
            }
         },
         placeholder: '请输入基金名称或代码',
      },
   }
}