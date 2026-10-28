from playwright.sync_api import sync_playwright

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 950})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/index.html')
    pg.wait_for_timeout(500)

    n = pg.eval_on_selector_all('.origin', 'els => els.length')
    print('interactive countries:', n)

    pg.eval_on_selector('#origin-map', 'el => el.scrollIntoView({block:"center"})')
    pg.wait_for_timeout(300)

    # hover Brazil
    pg.hover('[data-origin="Brazil"]')
    pg.wait_for_timeout(300)
    print('tooltip visible on hover:', pg.is_visible('#map-tip.show'))
    print('tooltip text:', repr(pg.inner_text('#map-tip')))
    pg.screenshot(path='/home/claude/t_hover.png', clip={'x': 180, 'y': 120, 'width': 1080, 'height': 700})

    # click Brazil
    pg.click('[data-origin="Brazil"]')
    pg.wait_for_timeout(350)
    print('modal open:', pg.is_visible('#origin-modal'))
    print('modal title:', repr(pg.inner_text('#origin-title')))
    print('items:', pg.eval_on_selector_all('#origin-items li', 'e => e.map(x => x.textContent)'))
    pg.screenshot(path='/home/claude/t_modal.png', clip={'x': 300, 'y': 0, 'width': 840, 'height': 700})

    pg.keyboard.press('Escape')
    pg.wait_for_timeout(250)
    print('closed on Esc:', not pg.is_visible('#origin-modal'))

    # Slovenian mode
    pg.click('.langs span[data-lang="si"]')
    pg.wait_for_timeout(300)
    pg.hover('[data-origin="Côte d\'Ivoire"]')
    pg.wait_for_timeout(300)
    print('SI tooltip:', repr(pg.inner_text('#map-tip')))
    pg.click('[data-origin="Ethiopia"]')
    pg.wait_for_timeout(300)
    print('SI modal title:', repr(pg.inner_text('#origin-title')))
    pg.screenshot(path='/home/claude/t_si.png', clip={'x': 300, 'y': 0, 'width': 840, 'height': 700})

    b.close()

print('JS errors:', errs or 'none')
