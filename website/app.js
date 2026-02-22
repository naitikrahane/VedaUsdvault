(function () {
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  const logBox = document.getElementById("live-log");

  const stateEls = {
    initialized: document.getElementById("st-initialized"),
    managerAuth: document.getElementById("st-manager-auth"),
    nextRequest: document.getElementById("st-next-request"),
    aliceUsde: document.getElementById("st-alice-usde"),
    aliceShares: document.getElementById("st-alice-shares"),
    vaultUsde: document.getElementById("st-vault-usde"),
    tellerShares: document.getElementById("st-teller-shares"),
    receiverUsde: document.getElementById("st-receiver-usde")
  };

  const actionPath = {
    init: { method: "POST", path: "/api/init" },
    deposit: { method: "POST", path: "/api/deposit" },
    "enable-manager": { method: "POST", path: "/api/enable-manager" },
    "manager-transfer": { method: "POST", path: "/api/manager-transfer" },
    "request-withdraw": { method: "POST", path: "/api/request-withdraw" },
    "claim-early": { method: "POST", path: "/api/claim-early" },
    "advance-3days": { method: "POST", path: "/api/advance-3days" },
    "claim-withdraw": { method: "POST", path: "/api/claim-withdraw" },
    "revoke-manager": { method: "POST", path: "/api/revoke-manager" },
    "manager-after-revoke": { method: "POST", path: "/api/manager-after-revoke" },
    "run-full": { method: "POST", path: "/api/run-full" },
    state: { method: "GET", path: "/api/state" }
  };

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.tab;
      tabs.forEach((tab) => tab.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));

      button.classList.add("active");
      const target = document.getElementById(id);
      if (target) {
        target.classList.add("active");
      }
    });
  });

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }

  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = button.dataset.copy || "";
      const original = button.textContent;
      try {
        const ok = await copyText(text);
        button.textContent = ok ? "Copied" : "Copy failed";
      } catch (_) {
        button.textContent = "Copy failed";
      }
      setTimeout(() => {
        button.textContent = original;
      }, 1200);
    });
  });

  function setStateText(el, value) {
    if (!el) return;
    el.textContent = value ?? "-";
  }

  function renderState(state) {
    if (!state) return;

    setStateText(stateEls.initialized, String(Boolean(state.initialized)));
    setStateText(stateEls.managerAuth, String(Boolean(state.managerAuthorized)));
    setStateText(stateEls.nextRequest, state.nextRequestId ?? "-");
    setStateText(stateEls.aliceUsde, state.balances?.aliceUsde ?? "-");
    setStateText(stateEls.aliceShares, state.balances?.aliceShares ?? "-");
    setStateText(stateEls.vaultUsde, state.balances?.vaultUsde ?? "-");
    setStateText(stateEls.tellerShares, state.balances?.tellerShares ?? "-");
    setStateText(stateEls.receiverUsde, state.balances?.receiverUsde ?? "-");
  }

  function appendLog(line) {
    if (!logBox) return;
    const now = new Date().toLocaleTimeString();
    const prev = logBox.textContent.trim();
    const base = prev === "Waiting for actions..." ? "" : `${prev}\n`;
    logBox.textContent = `${base}[${now}] ${line}`;
  }

  async function callApi(action) {
    const spec = actionPath[action];
    if (!spec) {
      appendLog(`Unknown action: ${action}`);
      return;
    }

    const init = { method: spec.method };
    if (spec.method === "POST") {
      init.headers = { "Content-Type": "application/json" };
      init.body = "{}";
    }

    const response = await fetch(spec.path, init);
    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error || "Request failed");
    }

    const data = payload.data || {};
    if (Array.isArray(data.steps)) {
      data.steps.forEach((step) => appendLog(step));
    }
    if (data.message) {
      appendLog(data.message);
    } else if (action === "state") {
      appendLog("State refreshed.");
    }
    renderState(data.state || data);
  }

  document.querySelectorAll(".action-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Running...";

      try {
        await callApi(action);
      } catch (error) {
        appendLog(`Error: ${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });

  callApi("state").catch(() => {
    appendLog("Start interactive mode with: npm run web:demo");
  });
})();
