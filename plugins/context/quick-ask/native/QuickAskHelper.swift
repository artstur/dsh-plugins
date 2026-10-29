import AppKit
import ApplicationServices
import Carbon

private enum Policy {
    static let hostBundle = "com.deepseek.dsh"
    static let helperBundle = "com.local.dsh.quickask.helper"
    static let captureDefault = false
    static let textLimit = 16_000
    static let nodeLimit = 1_000
    static let captureSeconds = 1.5
    static let messageSeconds: Float = 0.06
    static let debounceSeconds = 0.4
    static let toggleDebounceSeconds = 0.12
    static let hotkeySignature: OSType = 0x5141534B
    static let hotkeyID: UInt32 = 1
    static let keyCode = UInt32(kVK_ANSI_7)
    static let modifiers = UInt32(optionKey)
}

private func clipped(_ text: String, _ limit: Int = Policy.textLimit) -> String {
    String(text.prefix(limit))
}

private func publicURL(_ raw: String) -> String {
    guard raw.utf8.count <= 8_192, var url = URLComponents(string: raw),
          let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
          let host = url.host, !host.isEmpty else { return "" }
    url.scheme = scheme
    url.user = nil
    url.password = nil
    url.query = nil
    url.fragment = nil
    return url.string ?? ""
}

private func secure(role: String, subrole: String, protected: Bool) -> Bool {
    protected || role == "AXSecureTextField" || subrole == "AXSecureTextField"
}

/// The global hotkey stays registered while DSH is frontmost too: the system
/// consumes Option+7 before the renderer or its input method sees it, so the
/// key can no longer be committed into the composer as a stray character.
private func hotkeyDisposition(running: Bool) -> String? {
    running ? nil : "unavailable"
}

private func canRestore(id: String, savedID: String, frontBundle: String?) -> Bool {
    id == savedID && frontBundle == Policy.hostBundle
}

private func emit(_ object: [String: Any]) {
    guard var data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
    data.append(0x0A)
    do { try FileHandle.standardOutput.write(contentsOf: data) }
    catch { exit(0) }
}

private struct Snapshot {
    let id: String
    let appName: String
    let bundleId: String
    let pid: pid_t
    let title: String
    let url: String
    let text: String
    let scope: String
    let status: String
    let capturedAt: String

    func content(title: String = "", url: String = "", text: String = "",
                 scope: String = "none", status: String) -> Snapshot {
        Snapshot(id: id, appName: appName, bundleId: bundleId, pid: pid,
                 title: title, url: url, text: clipped(text), scope: scope,
                 status: status, capturedAt: capturedAt)
    }

    var object: [String: Any] {
        ["id": id, "appName": appName, "bundleId": bundleId, "pid": Int(pid),
         "title": title, "url": url, "text": text, "scope": scope,
         "status": status, "capturedAt": capturedAt]
    }
}

// 主线程失焦、关闭采集或退出时取消；工作线程不能绕过这道开关。
private final class CaptureGate {
    private let lock = NSLock()
    private var stopped = false
    func cancel() { lock.lock(); stopped = true; lock.unlock() }
    var cancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return stopped
    }
}

private struct CaptureResult {
    let snapshot: Snapshot
    let window: AXUIElement?
}

private final class WindowCapture {
    private let base: Snapshot
    private let gate: CaptureGate
    private let deadline: TimeInterval
    private var visits = 0
    private var incomplete = false
    private var readErrors = 0

    init(base: Snapshot, gate: CaptureGate, startedAt: TimeInterval) {
        self.base = base
        self.gate = gate
        deadline = startedAt + Policy.captureSeconds
    }

    private var available: Bool {
        if NSWorkspace.shared.frontmostApplication?.processIdentifier != base.pid { gate.cancel() }
        if gate.cancelled || ProcessInfo.processInfo.systemUptime >= deadline {
            incomplete = true
            return false
        }
        return true
    }

    private func prepare(_ element: AXUIElement) -> Bool {
        guard available else { return false }
        let remaining = Float(deadline - ProcessInfo.processInfo.systemUptime)
        guard remaining > 0 else { incomplete = true; return false }
        AXUIElementSetMessagingTimeout(element, min(Policy.messageSeconds, remaining))
        return true
    }

    private func visit() -> Bool {
        guard available, visits < Policy.nodeLimit else { incomplete = true; return false }
        visits += 1
        return true
    }

    private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        guard prepare(element) else { return nil }
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, name as CFString, &value)
        if error != .success && error != .noValue && error != .attributeUnsupported {
            incomplete = true
            readErrors += 1
        }
        guard available, error == .success else { return nil }
        return value
    }

    private func element(_ value: CFTypeRef?) -> AXUIElement? {
        guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }

    private func string(_ element: AXUIElement, _ name: String) -> String {
        let value = attribute(element, name)
        if let value = value as? String { return clipped(value) }
        if let value = value as? NSAttributedString { return clipped(value.string) }
        if name == "AXURL", let value = value as? URL { return clipped(value.absoluteString) }
        return ""
    }

    // 无法辨认控件类型时宁可跳过，绝不继续读取它的值或子树。
    private func isSafe(_ element: AXUIElement) -> Bool {
        let errorsBefore = readErrors
        let role = string(element, kAXRoleAttribute)
        let subrole = string(element, kAXSubroleAttribute)
        let protected = (attribute(element, "AXProtectedContent") as? Bool) ?? false
        return available && readErrors == errorsBefore && !role.isEmpty &&
            !secure(role: role, subrole: subrole, protected: protected)
    }

    private enum Membership { case safe, protected, unknown }

    private func membership(_ focused: AXUIElement, window: AXUIElement) -> Membership {
        var current: AXUIElement? = focused
        // 同时检查祖先，避免读取安全控件的后代；不能确认归属就不读选择内容。
        for _ in 0..<64 {
            guard let node = current, visit() else { return .unknown }
            let errorsBefore = readErrors
            guard isSafe(node) else {
                return available && readErrors == errorsBefore ? .protected : .unknown
            }
            if CFEqual(node, window) { return .safe }
            current = element(attribute(node, kAXParentAttribute))
        }
        return .unknown
    }

    func run() -> CaptureResult {
        guard visit(), NSWorkspace.shared.frontmostApplication?.processIdentifier == base.pid else {
            return CaptureResult(snapshot: base.content(status: "failed"), window: nil)
        }
        let app = AXUIElementCreateApplication(base.pid)
        guard let window = element(attribute(app, kAXFocusedWindowAttribute)) else {
            return CaptureResult(snapshot: base.content(status: incomplete ? "failed" : "empty"), window: nil)
        }
        let focused = element(attribute(app, kAXFocusedUIElementAttribute))
        let focusMembership = focused.map { membership($0, window: window) } ?? .unknown
        if focusMembership == .protected {
            return CaptureResult(snapshot: base.content(status: "protected"), window: window)
        }
        guard visit(), isSafe(window) else {
            return CaptureResult(snapshot: base.content(status: incomplete ? "failed" : "protected"), window: window)
        }
        let title = clipped(string(window, kAXTitleAttribute), 1_024)
        var url = publicURL(string(window, kAXDocumentAttribute))
        if url.isEmpty { url = publicURL(string(window, "AXURL")) }
        if let focused, focusMembership == .safe {
            let selected = string(focused, kAXSelectedTextAttribute)
            if !selected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return CaptureResult(snapshot: base.content(title: title, url: url, text: selected,
                                     scope: "selection", status: "partial"), window: window)
            }
        }
        var stack = [window]
        var seen: [AXUIElement] = []
        var pieces: [String] = []
        var distinct = Set<String>()
        var remaining = Policy.textLimit
        while available, remaining > 0, let node = stack.popLast() {
            guard visit() else { break }
            if seen.contains(where: { CFEqual($0, node) }) { continue }
            seen.append(node)
            guard isSafe(node) else { continue }
            let role = string(node, kAXRoleAttribute)
            if role == kAXWindowRole && !CFEqual(node, window) { continue }
            if let owner = element(attribute(node, kAXWindowAttribute)), !CFEqual(owner, window) { continue }
            let valueRoles = ["AXStaticText", "AXTextField", "AXTextArea", "AXComboBox", "AXHeading"]
            let names = valueRoles.contains(role) ? [kAXValueAttribute, kAXTitleAttribute] : [kAXTitleAttribute]
            for name in names {
                let value = string(node, name).trimmingCharacters(in: .whitespacesAndNewlines)
                if value.isEmpty || distinct.contains(value) { continue }
                distinct.insert(value)
                let separator = pieces.isEmpty ? 0 : 1
                guard remaining > separator else { break }
                let piece = clipped(value, remaining - separator)
                pieces.append(piece)
                remaining -= piece.count + separator
            }
            guard remaining > 0, available else { break }
            // 每个节点至多读取 64 个子节点，避免复制巨大 AXChildren 列表。
            guard prepare(node) else { break }
            var count: CFIndex = 0
            let countError = AXUIElementGetAttributeValueCount(node, kAXChildrenAttribute as CFString, &count)
            if countError == .success && count > 0 && available {
                let capacity = Policy.nodeLimit - visits - stack.count
                if capacity <= 0 { incomplete = true; continue }
                let requested = min(count, capacity, 64)
                if requested < count { incomplete = true }
                guard prepare(node) else { break }
                var children: CFArray?
                let error = AXUIElementCopyAttributeValues(node, kAXChildrenAttribute as CFString, 0, requested, &children)
                if error == .success, available, let children = children as? [AXUIElement] {
                    stack.append(contentsOf: children.reversed())
                } else { incomplete = true }
            } else if countError != .success && countError != .attributeUnsupported && countError != .noValue {
                incomplete = true
            }
        }
        let text = pieces.joined(separator: "\n")
        let status = !text.isEmpty ? "partial" : (incomplete ? "failed" : "empty")
        let snapshot = base.content(title: title, url: url, text: text,
                                    scope: text.isEmpty ? "none" : "window-accessible-text", status: status)
        return CaptureResult(snapshot: snapshot, window: window)
    }
}

private struct SourceReference {
    let id: String
    let app: NSRunningApplication
    let window: AXUIElement?
}

private let hotkeyCallback: EventHandlerUPP = { _, event, context in
    guard let event, let context else { return OSStatus(eventNotHandledErr) }
    var id = EventHotKeyID()
    let result = GetEventParameter(event, EventParamName(kEventParamDirectObject),
                                   EventParamType(typeEventHotKeyID), nil,
                                   MemoryLayout<EventHotKeyID>.size, nil, &id)
    guard result == noErr, id.signature == Policy.hotkeySignature, id.id == Policy.hotkeyID else {
        return OSStatus(eventNotHandledErr)
    }
    Unmanaged<Helper>.fromOpaque(context).takeUnretainedValue().wake()
    return noErr
}

private final class Helper: NSObject, NSApplicationDelegate, NSWindowDelegate {
    // This process already owns Policy.helperBundle. Asking Foundation for a
    // suite with the app's own bundle id returns nil on current macOS and the
    // old force-unwrap crashed in Helper.init(); the standard domain is the
    // correct persistent store for this helper application.
    private let preferences = UserDefaults.standard
    private var captureEnabled = Policy.captureDefault
    private var hotkey: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private var hotkeyState = "unavailable"
    private var lastStatus = ""
    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    private var gate: CaptureGate?
    private var source: SourceReference?
    private var busy = false
    private var lastWake = -Double.infinity
    private var lastToggle = -Double.infinity
    private var consent: NSAlert?
    private var stopped = false

    private var host: NSRunningApplication? {
        NSRunningApplication.runningApplications(withBundleIdentifier: Policy.hostBundle).first { !$0.isTerminated }
    }

    func start() {
        captureEnabled = preferences.object(forKey: "captureEnabled") as? Bool ?? Policy.captureDefault
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let result = InstallEventHandler(GetApplicationEventTarget(), hotkeyCallback, 1, &event,
                                        Unmanaged.passUnretained(self).toOpaque(), &handler)
        if result != noErr { handler = nil }
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didActivateApplicationNotification, NSWorkspace.didLaunchApplicationNotification,
                     NSWorkspace.didTerminateApplicationNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                guard let self else { return }
                if notification.name == NSWorkspace.didActivateApplicationNotification { self.gate?.cancel() }
                self.refreshHotkey()
                self.sendStatus()
            })
        }
        timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.refreshHotkey(retryConflict: false)
            self.sendStatus()
        }
        RunLoop.main.add(timer!, forMode: .common)
        refreshHotkey()
        sendStatus(force: true)
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while let line = readLine() {
                guard line.utf8.count <= 65_536, let data = line.data(using: .utf8),
                      let command = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                    DispatchQueue.main.async { emit(["type": "error", "code": "invalid-command"]) }
                    continue
                }
                DispatchQueue.main.async { self?.command(command) }
            }
            DispatchQueue.main.async { self?.quit() }
        }
    }

    private func unregister() {
        if let hotkey { UnregisterEventHotKey(hotkey) }
        hotkey = nil
    }

    private func refreshHotkey(retryConflict: Bool = true) {
        guard !stopped else { return }
        if let state = hotkeyDisposition(running: host != nil) {
            unregister()
            hotkeyState = state
            return
        }
        guard handler != nil else { hotkeyState = "unavailable"; return }
        guard hotkey == nil else { hotkeyState = "registered"; return }
        if hotkeyState == "conflict" && !retryConflict { return }
        let id = EventHotKeyID(signature: Policy.hotkeySignature, id: Policy.hotkeyID)
        let result = RegisterEventHotKey(Policy.keyCode, Policy.modifiers, id,
                                        GetApplicationEventTarget(), 0, &hotkey)
        hotkeyState = result == noErr ? "registered" :
            (result == eventHotKeyExistsErr ? "conflict" : "unavailable")
    }

    private func sendStatus(force: Bool = false) {
        let trusted = AXIsProcessTrusted()
        let fingerprint = "\(hotkeyState):\(trusted):\(captureEnabled)"
        guard force || fingerprint != lastStatus else { return }
        lastStatus = fingerprint
        emit(["type": "status", "platform": "darwin", "hotkey": hotkeyState,
              "accessibility": trusted, "captureEnabled": captureEnabled])
    }

    private func persistCapture(_ enabled: Bool) {
        captureEnabled = enabled
        preferences.set(enabled, forKey: "captureEnabled")
        preferences.synchronize()
        if !enabled { gate?.cancel() }
    }

    private func askConsent() {
        guard consent == nil else { consent?.window.makeKeyAndOrderFront(nil); return }
        let alert = NSAlert()
        alert.messageText = "允许随手问读取前台窗口？"
        alert.informativeText = "仅在你于其他应用按 Option+7 时，读取当时聚焦窗口的选中文本，或该窗口向辅助功能开放的部分文字，以及窗口标题和去除凭据、查询参数、片段的网址。最多读取 16000 个字符；跳过可识别的密码/安全控件，但普通文本仍可能包含敏感信息。不会后台采集、读取剪贴板、截图或读取其他窗口。内容先交给本机随手问预览，仅在你主动提交后才随问题发送给模型。你可以随时关闭采集。允许后 macOS 会提示辅助功能授权。"
        alert.alertStyle = .informational
        for (index, label) in ["允许并设置辅助功能", "取消"].enumerated() {
            let button = alert.addButton(withTitle: label)
            button.tag = index
            button.target = self
            button.action = #selector(consentClicked(_:))
        }
        consent = alert
        alert.layout()
        alert.window.delegate = self
        alert.window.center()
        // 非阻塞原生提示框：stdin 的关闭采集和 EOF 在提示期间仍能即时处理。
        NSApp.activate(ignoringOtherApps: true)
        alert.window.makeKeyAndOrderFront(nil)
    }

    private func dismissConsent() {
        consent?.window.orderOut(nil)
        consent = nil
    }

    @objc private func consentClicked(_ sender: NSButton) {
        guard consent != nil else { return }
        dismissConsent()
        if sender.tag == 0 {
            persistCapture(true)
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
        }
        sendStatus(force: true)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        dismissConsent()
        sendStatus(force: true)
        return false
    }

    private func command(_ command: [String: Any]) {
        guard !stopped else { return }
        switch command["type"] as? String {
        case "authorize": askConsent()
        case "status": refreshHotkey(); sendStatus(force: true)
        case "setCaptureEnabled":
            guard let enabled = command["enabled"] as? NSNumber,
                  CFGetTypeID(enabled) == CFBooleanGetTypeID() else {
                emit(["type": "error", "code": "invalid-command"])
                return
            }
            if enabled.boolValue { askConsent() }
            else { dismissConsent(); persistCapture(false); sendStatus(force: true) }
        case "restore":
            guard let id = command["id"] as? String else { return }
            restore(id)
        case "discard":
            if let id = command["id"] as? String, id == source?.id { source = nil }
        case "quit": quit()
        default: emit(["type": "error", "code": "invalid-command"])
        }
    }

    func wake() {
        // 先保存真实前台应用身份；授权提示或采集过程中不接受第二次唤起。
        guard let app = NSWorkspace.shared.frontmostApplication,
              app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
              !busy, consent == nil, !stopped else { return }
        let now = ProcessInfo.processInfo.systemUptime
        if app.bundleIdentifier == Policy.hostBundle {
            // DSH 在前台时热键也注册着：这里只通知页面切换浮层。按键已在系统
            // 热键层被消费，不会再进入输入法或输入框。
            guard host != nil else { refreshHotkey(); sendStatus(force: true); return }
            guard now - lastToggle >= Policy.toggleDebounceSeconds else { return }
            lastToggle = now
            emit(["type": "toggle"])
            return
        }
        guard now - lastWake >= Policy.debounceSeconds else { return }
        guard host != nil else { refreshHotkey(); sendStatus(force: true); return }
        lastWake = now
        busy = true
        source = nil
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let base = Snapshot(id: UUID().uuidString, appName: clipped(app.localizedName ?? "", 256),
                            bundleId: app.bundleIdentifier ?? "", pid: app.processIdentifier,
                            title: "", url: "", text: "", scope: "none", status: "empty",
                            capturedAt: formatter.string(from: Date()))
        let request = CaptureGate()
        gate = request
        if !captureEnabled || !AXIsProcessTrusted() {
            let status = captureEnabled ? "permission-required" : "capture-disabled"
            finish(CaptureResult(snapshot: base.content(status: status), window: nil), app: app, request: request)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = WindowCapture(base: base, gate: request, startedAt: now).run()
            DispatchQueue.main.async { self?.finish(result, app: app, request: request) }
        }
    }

    private func finish(_ result: CaptureResult, app: NSRunningApplication, request: CaptureGate) {
        guard !stopped else { return }
        busy = false
        gate = nil
        guard let host else { source = nil; refreshHotkey(); sendStatus(force: true); return }
        var snapshot = result.snapshot
        if !captureEnabled { snapshot = snapshot.content(status: "capture-disabled") }
        else if !AXIsProcessTrusted() { snapshot = snapshot.content(status: "permission-required") }
        else if request.cancelled || app.isTerminated ||
                    NSWorkspace.shared.frontmostApplication?.processIdentifier != app.processIdentifier {
            snapshot = snapshot.content(status: "failed")
        }
        source = SourceReference(id: snapshot.id, app: app, window: result.window)
        emit(["type": "wake", "snapshot": snapshot.object])
        focusHost(host)
        refreshHotkey()
        sendStatus()
    }

    private func focusHost(_ host: NSRunningApplication) {
        // The official desktop URL handler restores the BrowserWindow and calls
        // window.focus(). NSRunningApplication.activate alone only activates the
        // application and can leave a hidden/minimized renderer unfocused.
        // Keep the URL constant: foreground metadata/text must never enter it.
        guard let applicationURL = host.bundleURL,
              let wakeURL = URL(string: "dsh://open") else {
            host.activate(options: [.activateAllWindows])
            return
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        NSWorkspace.shared.open([wakeURL], withApplicationAt: applicationURL,
                                configuration: configuration) { _, error in
            if error != nil {
                DispatchQueue.main.async { host.activate(options: [.activateAllWindows]) }
            }
        }
    }

    private func restore(_ id: String) {
        guard let saved = source,
              canRestore(id: id, savedID: saved.id,
                         frontBundle: NSWorkspace.shared.frontmostApplication?.bundleIdentifier),
              !saved.app.isTerminated,
              let running = NSRunningApplication(processIdentifier: saved.app.processIdentifier),
              running.launchDate == saved.app.launchDate,
              running.bundleIdentifier == saved.app.bundleIdentifier else { return }
        source = nil
        guard let applicationURL = saved.app.bundleURL else { return }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        NSWorkspace.shared.openApplication(at: applicationURL, configuration: configuration) { activated, error in
            guard error == nil, activated?.processIdentifier == saved.app.processIdentifier,
                  activated?.launchDate == saved.app.launchDate else { return }
            if AXIsProcessTrusted(), let window = saved.window {
                var pid: pid_t = 0
                AXUIElementSetMessagingTimeout(window, Policy.messageSeconds)
                if AXUIElementGetPid(window, &pid) == .success && pid == saved.app.processIdentifier {
                    _ = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
                }
            }
        }
    }

    private func stop() {
        guard !stopped else { return }
        stopped = true
        gate?.cancel()
        source = nil
        dismissConsent()
        timer?.invalidate()
        for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
        observers.removeAll()
        unregister()
        if let handler { RemoveEventHandler(handler) }
        handler = nil
    }

    private func quit() { stop(); NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { stop() }
}

// 自测分支只测试纯函数和固定策略，位于所有 App/偏好/AX/热键初始化之前。
private func selfTest() {
    let checks: [String: Bool] = [
        "captureDefaultsOff": !Policy.captureDefault,
        "onlyOptionDigit7": Policy.keyCode == 26 && Policy.modifiers == UInt32(optionKey),
        "registerWithHost": hotkeyDisposition(running: true) == nil,
        "unavailableWithoutHost": hotkeyDisposition(running: false) == "unavailable",
        "toggleDebounce": Policy.toggleDebounceSeconds > 0 && Policy.toggleDebounceSeconds < Policy.debounceSeconds,
        "limits": Policy.nodeLimit == 1_000 && Policy.captureSeconds <= 1.5 && Policy.messageSeconds <= 0.06,
        "textCap": clipped(String(repeating: "测", count: 16_001)).count == 16_000,
        "sanitizeURL": publicURL("https://user:secret@example.com/path?q=private#fragment") == "https://example.com/path",
        "rejectLocalURL": publicURL("file:///private/example.txt").isEmpty,
        "rejectScriptURL": publicURL("javascript:example").isEmpty,
        "secureSubrole": secure(role: "AXTextField", subrole: "AXSecureTextField", protected: false),
        "secureRole": secure(role: "AXSecureTextField", subrole: "", protected: false),
        "protectedContent": secure(role: "AXTextField", subrole: "", protected: true),
        "restoreExactID": !canRestore(id: "old", savedID: "current", frontBundle: Policy.hostBundle),
        "restoreOnlyFromHost": !canRestore(id: "current", savedID: "current", frontBundle: "example.other"),
        "restoreCurrentSource": canRestore(id: "current", savedID: "current", frontBundle: Policy.hostBundle)
    ]
    let passed = checks.values.allSatisfy { $0 }
    emit(["type": "self-test", "ok": passed, "staticOnly": true, "checks": checks])
    exit(passed ? 0 : 1)
}

if CommandLine.arguments.dropFirst().contains("--self-test") { selfTest() }
signal(SIGPIPE, SIG_IGN)
private let app = NSApplication.shared
app.setActivationPolicy(.accessory)
private let helper = Helper()
app.delegate = helper
helper.start()
app.run()
