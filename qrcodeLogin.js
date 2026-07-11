import { createRequire } from 'module'
import { close_api, delay, send, startService } from "./utils/utils.js";
import { printGreen, printMagenta, printRed, printYellow } from "./utils/colorOut.js";
import { summarizeResponse } from "./utils/safeLog.js";
import { upsertUser, saveUserinfo } from "./utils/userinfo.js";

const require = createRequire(import.meta.url)
const QRCode = require('./api/node_modules/qrcode')

/**
 * 在终端渲染二维码
 * @param {string} url - 需要编码为二维码的 URL
 */
async function printQrcode(url) {
  try {
    const qrTerminal = await QRCode.toString(url, {
      type: 'terminal',
      small: true,
    })
    console.log(qrTerminal)
  } catch {
    // 降级：输出 URL 供手动打开
    printYellow(`二维码渲染失败，请手动打开此链接扫码：`)
    console.log(url)
  }
}

async function qrcode() {

  // 启动服务
  const api = startService()
  await delay(2000)
  let qrcode = ""
  const USERINFO = process.env.USERINFO
  const APPEND_USER = process.env.APPEND_USER
  const userinfo = (USERINFO && APPEND_USER == "是") ? JSON.parse(USERINFO) : []
  const args = process.argv.slice(2);
  const number = parseInt(process.env.NUMBER || args[0] || "1")
  try {
    for (let n = 0; n < number; n++) {
      // 二维码
      const result = await send(`/login/qr/key?timestrap=${Date.now()}`, "GET", {})
      if (result.status === 1) {
        qrcode = result.data.qrcode
        const qrUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${qrcode}`
        printMagenta("请使用酷狗音乐 APP 扫描下方二维码登录")
        await printQrcode(qrUrl)
        printMagenta(`如二维码无法扫描，请复制此链接到浏览器打开：`)
        printMagenta(qrUrl)
      } else {
        printRed("响应内容")
        console.dir(summarizeResponse(result), { depth: null })
        throw new Error("请求出错")
      }
      printMagenta("正在等待，请扫描二维码并确定登录")
      // 登录
      for (let i = 0; i < 25; i++) {
        const timestrap = Date.now();
        const res = await send(`/login/qr/check?key=${qrcode}&timestrap=${timestrap}`, "GET", {})
        const status = res?.data?.status
        switch (status) {
          case 0:
            printYellow("二维码已过期")
            break

          case 1:
            // 未扫描二维码
            break

          case 2:
            // 二维码未确认，请点击确认登录
            break

          case 4:
            printGreen("登录成功！")
            upsertUser(userinfo, { userid: res.data.userid, token: res.data.token }, APPEND_USER == "是")
            break

          default:
            printRed("请求出错")
            console.dir(summarizeResponse(res), { depth: null })
        }
        if (status == 4 || status == 0) {
          break
        }
        if (i == 24) {
          printRed("等待超时\n")
          break
        }
        await delay(5000)
      }
    }
    saveUserinfo(userinfo)
  } finally {
    close_api(api)
  }

  if (api.killed) {
    process.exit(0)
  }
}

qrcode()
