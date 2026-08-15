---
description: Force-enable the dsh-v4 router for all models in this session
---

Run this exact command to switch the dsh-v4-router to forced-on mode, then report the result to the user in one line:

```bash
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const p=path.join(process.env.KIMI_CODE_HOME||path.join(os.homedir(),".kimi-code"),"dsh-v4-router.state.json");let s;try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{s={mode:"auto",sessions:{}}}s.mode="on";fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(s,null,2));console.log("dsh-v4-router: mode=on (forced, applies to any model)")'
```
