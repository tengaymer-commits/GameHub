//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

func openWindow(url string) {
	for _, b := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser", "brave-browser"} {
		if p, err := exec.LookPath(b); err == nil {
			home, _ := os.UserHomeDir()
			if exec.Command(p, "--app="+url, "--user-data-dir="+home+"/.ctrlaltsurvive2003", "--window-size=1280,800", "--no-first-run").Start() == nil {
				return
			}
		}
	}
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	if exec.Command(opener, url).Start() != nil {
		fmt.Println("Open this address in your browser:", url)
	}
}

func fail(msg string) { fmt.Fprintln(os.Stderr, msg) }
