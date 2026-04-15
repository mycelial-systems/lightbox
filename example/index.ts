import { LightBox } from '../src/index.js'
import { qsa } from '@substrate-system/dom'
import '../src/index.css'
import './index.css'

if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
    localStorage.setItem('DEBUG', 'lightbox,lightbox:*')
} else {
    localStorage.removeItem('DEBUG')
}

/**
 * FOUCE
 * @see https://www.abeautifulsite.net/posts/flash-of-undefined-custom-elements/#awaiting-customelements.whendefined
 */
(async () => {
    await Promise.race([
        customElements.whenDefined(LightBox.TAG),
        new Promise<void>(resolve => {
            setTimeout(resolve, 2000)
        })
    ])

    // wait a little bit because there is the animation to consider
    await sleep(200)

    // wait for all the images to download
    await Promise.all(Array.from(qsa('light-box img')).map(_img => {
        const img = _img as HTMLImageElement
        if (img.complete) {
            return Promise.resolve()
        }

        return new Promise(resolve => {
            img.addEventListener('load', resolve)
        })
    }))

    document.documentElement.classList.remove('reduce-fouce')
})()

function sleep (ms:number):Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
