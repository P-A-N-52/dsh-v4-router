---
description: Show dsh-v4 router status (mode, session model, active recipe)
---

Run this exact command, then summarize the output to the user in 2-3 lines (current mode, this session's model, which recipe applies — w7 for flash / w6c for pro / inactive — and whether the protocol block was already injected):

```bash
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const p=path.join(process.env.KIMI_CODE_HOME||path.join(os.homedir(),".kimi-code"),"dsh-v4-router.state.json");let s;try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{s={mode:"auto",sessions:{}}}console.log(JSON.stringify({mode:s.mode,sessions:Object.fromEntries(Object.entries(s.sessions||{}).map(([k,v])=>[k,{model:v.model??null,personaInjected:!!v.personaInjected}]))},null,2))'
```
