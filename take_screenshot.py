import subprocess, sys
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'playwright', '-q'])
    subprocess.check_call([sys.executable, '-m', 'playwright', 'install', 'chromium'])
    from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto('http://localhost:8080/index.html', wait_until='networkidle', timeout=15000)
    page.wait_for_timeout(2000)
    page.screenshot(path='/home/user/webapp/screenshot_main.png', full_page=False)
    print("Main page screenshot saved")
    
    # Login page
    page2 = browser.new_page(viewport={'width': 1440, 'height': 900})
    page2.goto('http://localhost:8080/login.html', wait_until='networkidle', timeout=15000)
    page2.wait_for_timeout(1000)
    page2.screenshot(path='/home/user/webapp/screenshot_login.png', full_page=False)
    print("Login page screenshot saved")
    
    browser.close()
