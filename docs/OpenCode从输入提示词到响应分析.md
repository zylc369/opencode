# OpenCode从输入提示词到响应分析

```text
submit.ts promptAsync -> server.ts route("/session", SessionRoutes()) -> session.ts /:sessionID/prompt_async  SessionPrompt.prompt -> prompt.ts prompt -> prompt.ts loop
```



parentID是不是发起提示词的时候的消息？

`if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish) completed.add(msg.info.parentID)`

```json
{
    "role": "user",
    "time": {
        "created": 1771322565179
    },
    "summary": {
        "diffs": []
    },
    "agent": "build",
    "model": {
        "providerID": "opencode",
        "modelID": "big-pickle"
    }
}
```



```json
{
    "role": "assistant",
    "time": {
        "created": 1771322688164,
        "completed": 1771322695972
    },
    "parentID": "msg_c6b0c66f6001lQDdxk5m2FB96W",
    "modelID": "big-pickle",
    "providerID": "opencode",
    "mode": "build",
    "agent": "build",
    "path": {
        "cwd": "/Users/aserlili/Documents/Codes/PersonalAssistant",
        "root": "/Users/aserlili/Documents/Codes/PersonalAssistant"
    },
    "cost": 0,
    "tokens": {
        "total": 14068,
        "input": 11962,
        "output": 51,
        "reasoning": 43,
        "cache": {
            "read": 2055,
            "write": 0
        }
    },
    "finish": "stop"
}
```



为什么要`result.reverse()`？调用的地方为什么还要倒着遍历`for (let i = msgs.length - 1; i >= 0; i--) {`？



提示词：

```text
/Users/aserlili/Documents/Codes/opencode/packages/opencode/src/session/prompt.ts里面的loop函数看起来是根据用户输入的提示词循环请求大模型。我希望了解这段代码是如何运作的，下面是我当前的疑问：
1. MessageV2.filterCompacted
	1. 看起来是读取了session历史数据？为什么要读取，是将历史对话也发送给大模型吗？
	2. 它里面调用了result.reverse()为什么？
	3. 它的调用方通过for (let i = msgs.length - 1; i >= 0; i--)遍历它的返回结果，为什么倒着遍历？
2. ensureTitle用途是什么？
3. 如果task?.type === "subtask"返回true，它里面做了什么事情？开了新的线程执行吗？
4. 如果task?.type === "compaction"返回true，它里面做了什么事情？
5. const agent = await Agent.get(lastUser.agent) 是干嘛的？
6. const processor = SessionProcessor.create 是干嘛的？
7. InstructionPrompt是干嘛的？
8. const result = await processor.process是干嘛的？
9. 在哪里调用到大模型，整个函数调用链是怎么样的？
10. 工具是在什么时候使用的？
11. 为什么循环执行？哪些条件下循环退出？
12. 在调用大模型之前，是否对用户输入的提示词做了加工？如果有，是怎么加工的，给我函数调用链？
13. 在调用大模型之前，是否添加了系统提示词？如果添加了，在哪里添加的，给我函数调用链？添加的是什么？
14. 是否有session数据清理或压缩的逻辑？什么条件下触发？
15. 大模型返回的数据是怎么返回或发送给用户阅读的？大模型是不是流式返回的，当前代码或者和当前代码相关的代码中也是流式返回给用户的？给我函数调用链。
16. part id的用途是什么？
17. parentID是不是发起提示词的时候的消息ID？然后大模型每返回一次数据都向数据库插入一条数据，通过part id关联？
18. 大模型是否会返回一些选项，让用户确认目的，进而更好的解决用户的问题或任务？如果是，请告诉我代码逻辑是如何处理的以及调用链。
上面这些是我当前的疑问。

目的和要求：
1. 我的目的是完全了解opencode如何处理用户提交的提示词、如何与大模型交互、又如何反馈给用户的整个交互过程。
2. 你根据我的目的以及我的疑问，先做详细分析，然后分门别类使用中文输出分析文档。将详细分析结果使用中文输出到/Users/aserlili/Documents/Codes/opencode/docs目录下。
```

