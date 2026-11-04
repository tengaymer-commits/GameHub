//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

func browserCandidates() []string {
	pf, pf86, local := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData")
	var out []string
	for _, base := range []string{pf86, pf, local} {
		if base == "" {
			continue
		}
		out = append(out,
			filepath.Join(base, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(base, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(base, `BraveSoftware\Brave-Browser\Application\brave.exe`),
			filepath.Join(base, `Chromium\Application\chrome.exe`),
		)
	}
	return out
}

func openWindow(url string) {
	profile := filepath.Join(os.Getenv("LocalAppData"), "CtrlAltSurvive2003", "profile")
	_ = os.MkdirAll(profile, 0o755)
	for _, exe := range browserCandidates() {
		if _, err := os.Stat(exe); err != nil {
			continue
		}
		cmd := exec.Command(exe,
			"--app="+url,
			"--user-data-dir="+profile,
			"--window-size=1280,800",
			"--no-first-run", "--no-default-browser-check",
			"--autoplay-policy=no-user-gesture-required",
			"--disable-features=Translate,msEdgeSidebarV2",
		)
		if err := cmd.Start(); err == nil {
			go cmd.Wait()
			return
		}
	}
	// fallback: the default browser
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	if err := cmd.Start(); err != nil {
		fail("Could not open a browser window. Open this address manually:\n" + url)
	}
}

func fail(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(msg)
	c, _ := syscall.UTF16PtrFromString("Ctrl+Alt+Survive 2003")
	box.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x10)
}
