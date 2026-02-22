# Installer Kit

The installer runs the full required process:
1. Check system requirements
2. Install npm dependencies
3. Run diagnostics
4. Compile contracts
5. Run all tests
6. Run full demo flow

## Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\installer-kit\install.ps1
```

Start interactive website directly after installer:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer-kit\install.ps1 -StartWebDemo
```

## macOS/Linux

```bash
bash ./installer-kit/install.sh
```

Start interactive website directly after installer:

```bash
bash ./installer-kit/install.sh --start-web-demo
```
