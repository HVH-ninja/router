const { default: axios } = require("axios");
let MINUTES = 60

const Rcon = require("rcon-srcds").default,
      ChildProcess = require("child_process"),
      Axios = require("axios").default


let delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const LOCALHOST = "127.0.0.1"
const PUBLICHOST = "168.61.215.77"

const MAXIMUM_QUERY_TRIES = 10
const INACTIVITY_TIMEOUT = 5*MINUTES

let TIME_ELAPSED = `${Math.floor(INACTIVITY_TIMEOUT/MINUTES)} ${(INACTIVITY_TIMEOUT/MINUTES > 1) ? "minutes" : "seconds"}`

class NinjaFramework {
    #glstList = [];
    #activeThreads = [];

    SERVER_EXECUTABLE;
    DEFAULT_LAUNCH_PARAMS;
    RAW_TOKEN_STRING;
    
    /**
     * Construct the NinjaFramework class
    */
    constructor(options) {
        if (!options.srcds || !options.paramDefaults || !options.tokens) {
            return new Error("Framework class failed to construct. Missing needed options! Make sure srcds|paramsDefault|tokens are defined.")
        }

        this.SERVER_EXECUTABLE = options.srcds
        this.DEFAULT_LAUNCH_PARAMS = options.paramDefaults
        this.RAW_TOKEN_STRING = options.tokens;

        for (let i = 0; i < options.tokens.length; i++) {
            var token = options.tokens[i];
            var tokenobj = {
                token,
                used: false,
                id: i
            }
        
            this.#glstList.push(tokenobj)
        }
    }

    /**
     * Kill all threads
     */
    async DestroyAllThreads() {
        for (let i = 0; i < this.#activeThreads.length; i++) {
            const thread = this.#activeThreads[i];
            ChildProcess.spawn("taskkill", ["/pid", thread.pid, '/f', '/t']);
        }
        return
    }

    /**
     * Fetch a thread by its id
     * @param {string} id
     * @returns {ServerThread}
     */
    async DestroyOneThread(id) {
        return this.#activeThreads.find(thread => {return thread.identifier == id}).process.kill()
    }

    /**
     * Fetch a thread by its id
     * @param {string} id
     * @returns {ServerThread}
     */
    async FetchThreadById(id) {
        return this.#activeThreads.find(thread => {return thread.identifier == id})
    }

    /**
     * Fetch a server query from API
     */
    async QueryFetch(queryPort) {
        return (await axios({
            url: `https://koda.life/query.php?ip=${PUBLICHOST}&port=${queryPort}`,
            method: "GET",
        })).data;
    }

    Rcon = {
        /**
         * Options for Rcon
         */
        DefaultOptions: {
            tcp: false,       // false for UDP, true for TCP (default true)
            challenge: true  // true to use the challenge protocol (default true)
        },

        /**
         * Start an RCON connection to a server.
         * @param {number} port Port used to connect to the local server
         * @param {string} password Password to authenticate.
         * @returns {Rcon} Constructed "Rcon" class
         */
        async EstablishConnection(port, password) {
            var rcon = new Rcon({
                encoding: "ascii",
                timeout: (1*MINUTES)*1000,
                maxPacketSize: 0,
                host: LOCALHOST,
                port: port
            })
            rcon.authenticate(password)
            
            console.log(rcon)

            return rcon;
        }
    }

    /**
     * Fetch a Game Server token and reserve it to prevent
     * it from being used on multiple servers at the same time
     * @returns {object}
     */
    GLSTLockFetch() {
        for (let i = 0; i < this.#glstList.length; i++) {
            if (!this.#glstList[i].used) {
                this.#glstList[i].used = true
                console.log(`>>> GLST #${i} has been locked and used`)
                return this.#glstList[i]
            }
            else {
                continue;
            }
        }

        throw new Error("Couldn't hand out GSLT due to insuffient tokens.")
    }

    /**
     * Free a Game Server Token from reservation
     * @param {number} idx
     * @returns {void}
     */
    GLSTLockFree(idx) {
        console.log(`>>> GLST #${idx} has been freed`)
        this.#glstList[idx].used = false
        return
    }

    /**
     * Whip up that server thread
     * @param {string} additionalLaunchOptions
     */
    async ThreadMakeServer(additionalLaunchOptions = "") {
        let identifier = this.RandomString(6, false)
        console.log(`[${identifier}] Starting MakeServer thread, please wait...`)

        let glst = this.GLSTLockFetch()
        let launch = this.PrepareLaunch(glst.token, additionalLaunchOptions)

        let command = launch.commandLine
        let port = launch.port

        let process = ChildProcess.exec(command)
        console.log(`[${identifier}] Executed srcds.exe with launch options...`)
        
        let query = false
        var tries = 0;
        console.log(`[${identifier}] Waiting for outside query connection before continuing...`)
        while (query == false && tries < MAXIMUM_QUERY_TRIES) {
            await delay(1000)

            if (process && process.exitCode) {
                throw {
                    message: "Source Dedicated Server process is not running as it should be. Please contact kudos!#0957",
                    code: "PROCESS_NOT_RUNNING"
                }
            }

            tries++
            console.log(`[${identifier}] Query failed, retrying... (${tries}/${MAXIMUM_QUERY_TRIES})`)
            query = await this.QueryFetch(port)
        }

        if (tries >= MAXIMUM_QUERY_TRIES) {
            process.kill()
            throw {
                message: "Failed to make a query connection to the server. Quitting thread.",
                code: "MAXIMUM_TRIES_EXCEEDED"
            }
        }
        console.log(`[${identifier}] Outside query connection made!`)

        let rcon = await this.Rcon.EstablishConnection(port, launch.rconpw)
        console.log(`[${identifier}] Establishing an Rcon connection to the threaded server.`)

        var ProcessId = process.pid
        var THREAD = {pid: ProcessId, process, rcon, identifier, launch}
        var pushidx = this.#activeThreads.push(THREAD)
        

        var SecondsInactive = 0
        var CheckLoop = setInterval(() => {

            this.QueryFetch(THREAD.launch.port).then(response => {
                query = response
                if (query.players == 0) {
                    SecondsInactive += MINUTES;
                    if (SecondsInactive >= INACTIVITY_TIMEOUT) {
                        ChildProcess.spawn("taskkill", ["/pid", process.pid, '/f', '/t']);
                        console.log(`[${identifier}] Server passed ${TIME_ELAPSED} with no players, killing the server thread.`)
                    }
                }
                else {
                    SecondsInactive = 0
                }
            })
        }, MINUTES * 1000)
        console.log(`[${identifier}] Created thread check loop.`)

        console.log(`[${identifier}] Created thread events.`)
        process.on("close", () => {
            this.GLSTLockFree(glst.id)
            clearInterval( CheckLoop )
            this.#activeThreads = this.#activeThreads.splice(pushidx, 1)
            console.log(`[${THREAD.identifier}] Thread under pid ${ProcessId} has died and will now be discarded.`)
        })

        console.log(`[${identifier}] Returning server thread information back to the Promise.`)
        return THREAD
    }

    /**
     * Create a random identifier string by length
     * @param {number} length
     * @param {boolean} secure Secure type of string?
     * @return {string}
     */
    RandomString(length = 16, secure = true) {
        var characters = secure ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.$@" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", result = '';
        for (let i = 0; i < length; i++) {
            result += characters[Math.floor(Math.random() * characters.length)]
        }
        return result
    }

    /**
     * Create command with options
     * @param {string} additionalOptions
     */
    PrepareLaunch(token, additionalOptions = "") {
        var randomPort = Math.floor( Math.random() * 9999 ) + 20000;
        var randomPassword = this.RandomString(24)
        var rconPassword = this.RandomString(32)
        return {
            address: `${this.RandomString(25, false)}.na.hvh.ninja`,
            commandLine: `.\\${this.SERVER_EXECUTABLE} ${this.DEFAULT_LAUNCH_PARAMS} +sv_setsteamaccount ${token} ${additionalOptions} -port ${randomPort} +tv_port ${randomPort+10512} +rcon_password "${rconPassword}" +sv_password "${randomPassword}`,
            port: randomPort,
            password: randomPassword,
            rconpw: rconPassword
        }
    }
}

module.exports = NinjaFramework