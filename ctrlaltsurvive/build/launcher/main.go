// Ctrl+Alt+Survive 2003 launcher.
// The whole game is embedded in this executable. It is served on 127.0.0.1 and opened
// in an app window (Edge / Chrome / Brave with --app), or the default browser as a fallback.
// A fixed port keeps the save (localStorage) in the same place between launches.
// The launcher exits once the game window has been closed (heartbeat from the page).
package main

import (
	_ "embed"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

//go:embed game.html
var gameHTML string

const (
	firstPort = 27003
	lastPort  = 27012
	whoami    = "ctrl-alt-survive-2003"
)

// Injected into the page: keeps the launcher alive while the game is open.
const heartbeat = `<script>
(function(){
  function ping(){ fetch('/__alive',{cache:'no-store'}).catch(function(){}); }
  ping(); setInterval(ping, 3000);
  addEventListener('pagehide', function(){ try { navigator.sendBeacon('/__bye'); } catch(e){} });
})();
</script>`

var (
	mu       sync.Mutex
	lastPing time.Time
	byeAt    time.Time
	started  = time.Now()
)

func main() {
	ln, url, err := listen()
	if err != nil {
		fail("Could not start the game: " + err.Error())
		return
	}
	if ln == nil {
		// another copy is already running: just open a window to it
		openWindow(url)
		return
	}
	page := strings.Replace(gameHTML, "</body>", heartbeat+"\n</body>", 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		io.WriteString(w, page)
	})
	mux.HandleFunc("/__alive", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		lastPing, byeAt = time.Now(), time.Time{}
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/__bye", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		byeAt = time.Now()
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/__quit", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
		go func() { time.Sleep(300 * time.Millisecond); os.Exit(0) }()
	})
	mux.HandleFunc("/__whoami", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, whoami) })
	go func() { _ = http.Serve(ln, mux) }()

	openWindow(url)

	// lifetime: stay up while the page pings. Background windows may be throttled to one
	// timer per minute, so allow a generous gap. A page close (pagehide beacon) with no
	// following ping (a reload pings again) ends the program quickly.
	for {
		time.Sleep(time.Second)
		mu.Lock()
		lp, bye := lastPing, byeAt
		mu.Unlock()
		now := time.Now()
		switch {
		case lp.IsZero() && now.Sub(started) > 3*time.Minute:
			os.Exit(0) // the window never opened
		case !bye.IsZero() && now.Sub(bye) > 4*time.Second:
			os.Exit(0) // window closed
		case !lp.IsZero() && now.Sub(lp) > 150*time.Second:
			os.Exit(0) // window gone without a goodbye
		}
	}
}

// listen grabs the first free port in the range. If a port already runs this game,
// it returns ln == nil and that instance's URL.
func listen() (net.Listener, string, error) {
	var lastErr error
	for p := firstPort; p <= lastPort; p++ {
		addr := fmt.Sprintf("127.0.0.1:%d", p)
		url := "http://" + addr + "/"
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			return ln, url, nil
		}
		lastErr = err
		c := http.Client{Timeout: 700 * time.Millisecond}
		if resp, err := c.Get(url + "__whoami"); err == nil {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if string(b) == whoami {
				return nil, url, nil
			}
		}
	}
	return nil, "", lastErr
}
