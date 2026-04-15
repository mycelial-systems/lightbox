import { test } from '@substrate-system/tapzero'
import { waitFor, click } from '@substrate-system/dom'
import { wait } from './util.js'
import { LightBox } from '../src/index.js'

const IMG_DATA = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

test('register custom element', async t => {
    document.body.innerHTML = '<light-box class="test"></light-box>'
    const el = await waitFor('light-box')
    t.ok(el, 'should find custom element')
})

test('open and close overlay', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
            <img src="${IMG_DATA}" alt="image two" />
        </light-box>
    `

    const el = await waitFor('light-box')
    t.ok(el, 'should find light-box before interaction')
    if (!el) return

    const firstImage = el.querySelector('img')!

    t.ok(firstImage, 'should have an image to click')

    click(firstImage)
    await wait(20)

    const overlay = document.querySelector('.light-box-overlay')

    t.ok(overlay, 'should create overlay')
    t.ok(overlay?.classList.contains('is-visible'), 'should show overlay')

    const prevLabel = overlay?.querySelector(
        '[data-light-box-prev] .visually-hidden'
    )
    const nextLabel = overlay?.querySelector(
        '[data-light-box-next] .visually-hidden'
    )

    t.equal(
        prevLabel?.textContent?.trim(),
        'Previous image',
        'should include hidden label text for previous control'
    )
    t.equal(
        nextLabel?.textContent?.trim(),
        'Next image',
        'should include hidden label text for next control'
    )

    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
    }))

    await wait(320)

    t.ok(!overlay?.classList.contains('is-visible'),
        'should hide overlay after pressing Escape')
})

test('focus close button first and tab order is close, prev, next', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
            <img src="${IMG_DATA}" alt="image two" />
        </light-box>
    `

    const el = await waitFor('light-box')
    t.ok(el, 'should find light-box before interaction')
    if (!el) return

    const firstImage = el.querySelector('img')!
    click(firstImage)
    // Wait for transition animation (300ms) to complete so focus is set
    await wait(350)

    const closeButton = document.querySelector('[data-light-box-close]')
    const prevButton = document.querySelector('[data-light-box-prev]')
    const nextButton = document.querySelector('[data-light-box-next]')

    t.ok(closeButton, 'should have close button')
    t.ok(prevButton, 'should have prev button')
    t.ok(nextButton, 'should have next button')

    t.equal(document.activeElement, closeButton,
        'close button should be focused initially')

    // Verify DOM order is close → prev → next for natural tab flow
    const stage = document.querySelector('.light-box-stage')
    const buttons = stage?.querySelectorAll('button')
    t.equal(buttons?.[0], closeButton,
        'close button should be first in DOM order')
    t.equal(buttons?.[1], prevButton,
        'prev button should be second in DOM order')
    t.equal(buttons?.[2], nextButton,
        'next button should be third in DOM order')

    // cleanup
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
    }))
    await wait(320)
})

test('close overlay on backdrop click', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
            <img src="${IMG_DATA}" alt="image two" />
        </light-box>
    `

    const el = await waitFor('light-box')
    t.ok(el, 'should find light-box before interaction')
    if (!el) return

    const firstImage = el.querySelector('img')
    t.ok(firstImage, 'should have an image to click')

    firstImage?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(20)

    const overlay = document.querySelector('.light-box-overlay')
    const backdrop = document.querySelector('[data-light-box-backdrop]')

    t.ok(overlay?.classList.contains('is-visible'),
        'should show overlay before backdrop click')
    t.ok(backdrop, 'should render backdrop')

    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(320)

    t.ok(!overlay?.classList.contains('is-visible'),
        'should hide overlay after backdrop click')
})

test('emit open event', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
        </light-box>
    `

    const el = await waitFor('light-box') as LightBox | null
    t.ok(el, 'should find light-box')
    if (!el) return

    let openFired = false
    let namespacedOpenFired = false

    el.addEventListener('open', () => {
        openFired = true
    })

    el.addEventListener(LightBox.event('open'), () => {
        namespacedOpenFired = true
    })

    const firstImage = el.querySelector('img')!
    click(firstImage)
    await wait(20)

    t.ok(openFired, 'should fire non-namespaced open event')
    t.ok(namespacedOpenFired, 'should fire namespaced open event')

    // cleanup
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
    }))
    await wait(320)
})

test('emit close event with reason for escape', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
        </light-box>
    `

    const el = await waitFor('light-box') as LightBox | null
    t.ok(el, 'should find light-box')
    if (!el) return

    const firstImage = el.querySelector('img')!
    click(firstImage)
    await wait(20)

    let closeReason:string | undefined
    let namespacedCloseReason:string | undefined

    el.addEventListener('close', ((ev:CustomEvent) => {
        closeReason = ev.detail?.reason
    }) as EventListener)

    el.addEventListener(LightBox.event('close'), ((ev:CustomEvent) => {
        namespacedCloseReason = ev.detail?.reason
    }) as EventListener)

    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
    }))
    await wait(320)

    t.equal(closeReason, 'escape',
        'should include escape reason in non-namespaced close event')
    t.equal(namespacedCloseReason, 'escape',
        'should include escape reason in namespaced close event')
})

test('emit close event with reason for button-click', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
        </light-box>
    `

    const el = await waitFor('light-box') as LightBox | null
    t.ok(el, 'should find light-box')
    if (!el) return

    const firstImage = el.querySelector('img')!
    click(firstImage)
    await wait(20)

    let closeReason:string | undefined

    el.addEventListener('close', ((ev:CustomEvent) => {
        closeReason = ev.detail?.reason
    }) as EventListener)

    const closeBtn = document.querySelector('[data-light-box-close]')
    t.ok(closeBtn, 'should have close button')
    closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(320)

    t.equal(closeReason, 'button-click',
        'should include button-click reason in close event')
})

test('emit close event with reason for background-click', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
        </light-box>
    `

    const el = await waitFor('light-box') as LightBox | null
    t.ok(el, 'should find light-box')
    if (!el) return

    const firstImage = el.querySelector('img')!
    click(firstImage)
    await wait(20)

    let closeReason:string | undefined

    el.addEventListener('close', ((ev:CustomEvent) => {
        closeReason = ev.detail?.reason
    }) as EventListener)

    const backdrop = document.querySelector('[data-light-box-backdrop]')
    t.ok(backdrop, 'should have backdrop')
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(320)

    t.equal(closeReason, 'background-click',
        'should include background-click reason in close event')
})

test('preventDefault stops open', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
        </light-box>
    `

    const el = await waitFor('light-box') as LightBox | null
    t.ok(el, 'should find light-box')
    if (!el) return

    el.addEventListener('open', (ev) => {
        ev.preventDefault()
    })

    const firstImage = el.querySelector('img')!
    click(firstImage)
    await wait(20)

    const overlay = document.querySelector('.light-box-overlay')
    t.ok(!overlay, 'should not create overlay when open is prevented')
})

test('preventDefault stops close', async t => {
    document.body.innerHTML = `
        <light-box class="test-gallery">
            <img src="${IMG_DATA}" alt="image one" />
        </light-box>
    `

    const el = await waitFor('light-box') as LightBox | null
    t.ok(el, 'should find light-box')
    if (!el) return

    const firstImage = el.querySelector('img')!
    click(firstImage)
    await wait(20)

    const overlay = document.querySelector('.light-box-overlay')
    t.ok(overlay?.classList.contains('is-visible'),
        'should show overlay before close attempt')

    el.addEventListener('close', (ev) => {
        ev.preventDefault()
    })

    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
    }))
    await wait(320)

    t.ok(overlay?.classList.contains('is-visible'),
        'should keep overlay visible when close is prevented')

    // cleanup: remove the preventing listener and close normally
    el.replaceWith(el.cloneNode(true))
})

test('all done', () => {
    // @ts-expect-error tests
    window.testsFinished = true
})
