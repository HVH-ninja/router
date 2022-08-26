const ChildProcess = require("child_process"),
      FileSystem = require("fs"),
      Rcon = require("rcon-srcds"),
      http = require("http"),
      https = require("https"),
      express = require("express"),
      WebSock = require("ws"),
      bodyparser = require("body-parser")

let app = express()
let server = http.createServer()
let wss = new WebSock.Server({server})

const MASTER_KEYS = FileSystem.readFileSync("masterkeys.txt", {encoding: "utf8", flag: "r"}).split("\r\n")

/**
 * @param {http.IncomingMessage} request 
 * @param {http.OutgoingMessage} response
 */
function has_authorization(request, response) {
    console.log(request.url)
//    if(!MASTER_KEYS.includes(response.headers.get("X-Master-Key")) || request.destination)
}

const NFW = new (require("./NinjaFramework"))({
    srcds: "server\\srcds.exe" /* /path/to/srcds.exe */,
    paramDefaults: "-game csgo -console -insecure -maxplayers_override 24 +game_type 0 +game_mode 1 +map de_dust2_old2 +mapgroup mg_active",
    tokens: FileSystem.readFileSync("tokens.txt", {encoding: "utf8", flag: "r"}).split("\r\n")
})

app.use(express.json());

server.on('request', app)

app.get("/", (request, response) => {
    response.setHeader('X-Powered-By', 'NinjaFramework')
    response.status(204).send(null)
})

app.get("/KillThreads", async (request, response) => {
    NFW.DestroyAllThreads().then(() => {
        response.json({
            status: "OK",
            message: "Terminated all active threads."
        })    
    }).catch(ex => {
        response.status(400).json({error: ex})
    })
})

app.get("/KillThread", async (request, response) => {
    NFW.DestroyAllThreads().then(() => {
        response.json({
            status: "OK",
            message: "Seeked and destroyed."
        })    
    }).catch(ex => {
        response.status(400).json({error: ex})
    })
})

app.get("/DispatchCmd", async (request, repsonse) => {
    NFW.FetchThreadById(request.query["id"])
    .then(thread => {
        console.log(thread)
        if (thread) {
            thread.rcon.execute(request.query["in"])
        }
    })
})


app.get("/ThreadInfo", async (request, response) => {
    NFW.FetchThreadById(request.query["id"])
    .then(thread => {
        if (thread) {
            response.json({
                id: thread.identifier,
                info: {
                    address: thread.launch.address,
                    port: thread.launch.port,
                    password: thread.launch.password
                },
                connectUrl: `steam://connect/${thread.launch.address}:${thread.launch.port}/${thread.launch.password}`
            })
        }
        else {
            response.json({error:{
                message: "There is no valid server under that id currently active.",
                code: "THREAD_ID_NOT_FOUND"
            }})
        }
    })
})

app.get("/Start", async (request, response) => {
//        response.sendStatus(403)
//        return

    NFW.ThreadMakeServer().then(thread => {
        response.json({
            id: thread.identifier,
            info: {
                address: thread.launch.address,
                port: thread.launch.port,
                password: thread.launch.password
            },
            connectUrl: `steam://connect/${thread.launch.address}:${thread.launch.port}/${thread.launch.password}`
        })
    }).catch(ex => {
        response.json({error: ex})
    })
})

server.listen(80)
console.log(`>> Now listening to port 80 (http/ws)`)


