import { WebComponent, define } from '@substrate-system/web-component'
import {
    lockBodyScrolling,
    unlockBodyScrolling
} from '@substrate-system/scroll-lock'
import Debug from '@substrate-system/debug'
const debug = Debug('lightbox')

export type CloseReason = 'escape' | 'button-click' | 'background-click'

type GalleryItem = {
    thumb:HTMLImageElement
    src:string
    alt:string
}

type Rect = {
    top:number
    left:number
    width:number
    height:number
}

const TRANSITION_MS = 300
const TRANSITION_CURVE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const OVERLAY_VISIBLE_CLASS = 'is-visible'
const OVERLAY_OPEN_CLASS = 'is-open'

declare global {
    interface HTMLElementTagNameMap {
        'light-box':LightBox
    }
}

export class LightBox extends WebComponent.create('light-box') {
    static TAG = 'light-box'
    private items:GalleryItem[] = []
    private overlay:HTMLDivElement|null = null
    private backdrop:HTMLDivElement|null = null
    private stage:HTMLDivElement|null = null
    private stageImage:HTMLImageElement|null = null
    private prevButton:HTMLButtonElement|null = null
    private nextButton:HTMLButtonElement|null = null
    private closeButton:HTMLButtonElement|null = null
    private counter:HTMLParagraphElement|null = null
    private activeIndex = -1
    private isOpen = false
    private animationToken = 0
    private observer:MutationObserver|null = null
    private mediaQueryList:MediaQueryList|null = null

    private readonly onGalleryClick = (event:Event):void => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        const thumb = target.closest('img[data-light-box-thumb]')
        if (!(thumb instanceof HTMLImageElement)) return
        const index = this.indexOfThumb(thumb)
        if (index < 0) return
        event.preventDefault()
        this.open(index)
    }

    private readonly onGalleryKeydown = (event:Event):void => {
        if (!(event instanceof KeyboardEvent)) return
        if (
            event.key !== 'Enter' &&
            event.key !== ' ' &&
            event.key !== 'Spacebar'
        ) {
            return
        }

        const target = event.target
        if (!(target instanceof HTMLElement)) return
        const thumb = target.closest('img[data-light-box-thumb]')
        if (!(thumb instanceof HTMLImageElement)) return
        const index = this.indexOfThumb(thumb)
        if (index < 0) return
        event.preventDefault()
        this.open(index)
    }

    private readonly onDocumentKeydown = (event:KeyboardEvent):void => {
        if (!this.isOpen) return

        if (event.key === 'Escape') {
            event.preventDefault()
            this.close('escape')
            return
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            this.showPrevious()
            return
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault()
            this.showNext()
        }
    }

    private readonly onBackdropClick = ():void => {
        debug('backdrop click...')
        this.close('background-click')
    }

    private readonly onStageClick = (event:MouseEvent):void => {
        if (event.target !== this.stage) return
        debug('stage click...')
        this.close('background-click')
    }

    private readonly onCloseClick = (event:MouseEvent):void => {
        event.preventDefault()
        this.close('button-click')
    }

    private readonly onPrevClick = (event:MouseEvent):void => {
        event.preventDefault()
        this.showPrevious()
    }

    private readonly onNextClick = (event:MouseEvent):void => {
        event.preventDefault()
        this.showNext()
    }

    private readonly onWindowResize = ():void => {
        if (!this.isOpen || !this.stageImage || this.activeIndex < 0) return
        const active = this.items[this.activeIndex]
        if (!active) return
        const width = this.stageImage.naturalWidth || active.thumb.naturalWidth || active.thumb.width
        const height = this.stageImage.naturalHeight || active.thumb.naturalHeight || active.thumb.height
        const target = this.computeTargetRect(width, height)
        this.applyRect(this.stageImage, target)
    }

    render ():void {}

    connectedCallback ():void {
        super.connectedCallback()
        this.refreshItems()
        this.addEventListener('click', this.onGalleryClick)
        this.addEventListener('keydown', this.onGalleryKeydown)

        this.observer = new MutationObserver(() => {
            this.refreshItems()
        })

        this.observer.observe(this, { childList: true, subtree: true })

        if ('matchMedia' in window) {
            this.mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)')
        }
    }

    disconnectedCallback ():void {
        this.removeEventListener('click', this.onGalleryClick)
        this.removeEventListener('keydown', this.onGalleryKeydown)
        document.removeEventListener('keydown', this.onDocumentKeydown)
        window.removeEventListener('resize', this.onWindowResize)
        this.observer?.disconnect()
        this.observer = null
        unlockBodyScrolling(this)
        this.teardownOverlay()
    }

    private refreshItems ():void {
        const thumbs = Array.from(this.querySelectorAll('img'))

        this.items = thumbs.map((thumb, index) => {
            thumb.dataset.lightBoxThumb = 'true'

            const isInteractive = this.isInsideInteractiveElement(thumb)
            if (!isInteractive && !thumb.hasAttribute('tabindex')) {
                thumb.tabIndex = 0
            }

            if (!isInteractive && !thumb.hasAttribute('role')) {
                thumb.setAttribute('role', 'button')
            }

            thumb.setAttribute('aria-label',
                `Open image ${index + 1} of ${thumbs.length}`)

            return {
                thumb,
                src: this.getItemSrc(thumb),
                alt: thumb.alt || `Image ${index + 1}`
            }
        })

        this.updateCounter()
        this.updateNavigationState()
    }

    private isInsideInteractiveElement (thumb:HTMLImageElement):boolean {
        return Boolean(thumb.closest('button,a,[role="button"]'))
    }

    private indexOfThumb (thumb:HTMLImageElement):number {
        return this.items.findIndex(item => item.thumb === thumb)
    }

    private normalizeIndex (index:number):number {
        if (this.items.length === 0) return -1
        return (((index % this.items.length) + this.items.length) %
            this.items.length)
    }

    private ensureOverlay ():void {
        if (this.overlay) return

        const overlay = document.createElement('div')
        overlay.className = 'light-box-overlay'
        overlay.setAttribute('aria-hidden', 'true')
        overlay.innerHTML = `
            <div class="light-box-backdrop" data-light-box-backdrop></div>
            <div class="light-box-stage">
                <button
                    class="light-box-close"
                    type="button"
                    data-light-box-close
                >
                    <span aria-hidden="true">&times;</span>
                    <span class="visually-hidden">Close lightbox</span>
                </button>
                <button
                    class="light-box-control light-box-prev"
                    type="button"
                    data-light-box-prev
                >
                    <span aria-hidden="true">&lsaquo;</span>
                    <span class="visually-hidden">Previous image</span>
                </button>
                <img class="light-box-image" alt="" data-light-box-image />
                <button
                    class="light-box-control light-box-next"
                    type="button"
                    data-light-box-next
                >
                    <span aria-hidden="true">&rsaquo;</span>
                    <span class="visually-hidden">Next image</span>
                </button>
                <p class="light-box-counter" aria-live="polite" data-light-box-counter></p>
            </div>
        `

        const backdrop = overlay.querySelector('[data-light-box-backdrop]')
        const stage = overlay.querySelector('.light-box-stage')
        const image = overlay.querySelector('[data-light-box-image]')
        const prev = overlay.querySelector('[data-light-box-prev]')
        const next = overlay.querySelector('[data-light-box-next]')
        const close = overlay.querySelector('[data-light-box-close]')
        const counter = overlay.querySelector('[data-light-box-counter]')

        if (!(backdrop instanceof HTMLDivElement)) return
        if (!(stage instanceof HTMLDivElement)) return
        if (!(image instanceof HTMLImageElement)) return
        if (!(prev instanceof HTMLButtonElement)) return
        if (!(next instanceof HTMLButtonElement)) return
        if (!(close instanceof HTMLButtonElement)) return
        if (!(counter instanceof HTMLParagraphElement)) return

        this.overlay = overlay
        this.backdrop = backdrop
        this.stage = stage
        this.stageImage = image
        this.prevButton = prev
        this.nextButton = next
        this.closeButton = close
        this.counter = counter

        this.backdrop.addEventListener('click', this.onBackdropClick)
        this.stage.addEventListener('click', this.onStageClick)
        this.closeButton.addEventListener('click', this.onCloseClick)
        this.prevButton.addEventListener('click', this.onPrevClick)
        this.nextButton.addEventListener('click', this.onNextClick)

        document.body.append(overlay)
    }

    private teardownOverlay ():void {
        if (!this.overlay) return
        this.backdrop?.removeEventListener('click', this.onBackdropClick)
        this.stage?.removeEventListener('click', this.onStageClick)
        this.closeButton?.removeEventListener('click', this.onCloseClick)
        this.prevButton?.removeEventListener('click', this.onPrevClick)
        this.nextButton?.removeEventListener('click', this.onNextClick)
        this.overlay.remove()
        this.overlay = null
        this.backdrop = null
        this.stage = null
        this.stageImage = null
        this.prevButton = null
        this.nextButton = null
        this.closeButton = null
        this.counter = null
    }

    async open (index:number):Promise<void> {
        const normalized = this.normalizeIndex(index)
        if (normalized < 0) return

        const dispatchAllowed = this.dispatch('open', { cancelable: true })
        const emitAllowed = this.emit('open', { cancelable: true })
        if (!dispatchAllowed || !emitAllowed) return

        this.ensureOverlay()
        if (!this.overlay || !this.backdrop || !this.stageImage) return

        const token = ++this.animationToken
        const item = this.items[normalized]
        if (!item) return
        const fromRect = this.safeRect(this.getRect(item.thumb))

        this.activeIndex = normalized
        this.isOpen = true

        this.stageImage.alt = item.alt
        this.stageImage.src = item.src
        await this.waitForImageLoad(this.stageImage)
        if (token !== this.animationToken) return

        const toRect = this.computeTargetRect(
            this.stageImage.naturalWidth || item.thumb.naturalWidth || fromRect.width,
            this.stageImage.naturalHeight || item.thumb.naturalHeight || fromRect.height
        )

        // Set the start geometry before showing the overlay so we do not flash
        // from the previous image's closing position.
        this.stageImage.style.transition = ''
        this.stageImage.style.opacity = '0'
        this.applyRect(this.stageImage, fromRect)

        this.overlay.classList.add(OVERLAY_VISIBLE_CLASS)
        this.overlay.setAttribute('aria-hidden', 'false')
        lockBodyScrolling(this)
        document.addEventListener('keydown', this.onDocumentKeydown)
        window.addEventListener('resize', this.onWindowResize)

        this.updateCounter()
        this.updateNavigationState()

        if (this.prefersReducedMotion()) {
            this.overlay.classList.add(OVERLAY_OPEN_CLASS)
            this.applyRect(this.stageImage, toRect)
            this.stageImage.style.opacity = '1'
            this.closeButton?.focus()
            return
        }

        this.stageImage.style.transition = this.imageTransition()
        this.backdrop.style.transition = `opacity ${TRANSITION_MS}ms ${TRANSITION_CURVE}`

        this.forceReflow(this.overlay)

        this.stageImage.style.opacity = '1'
        this.overlay.classList.add(OVERLAY_OPEN_CLASS)
        this.applyRect(this.stageImage, toRect)

        await this.wait(TRANSITION_MS)
        if (token !== this.animationToken) return
        this.stageImage.style.transition = ''
        this.backdrop.style.transition = ''
        this.closeButton?.focus()
    }

    async close (reason?:CloseReason):Promise<void> {
        if (
            !this.isOpen || this.activeIndex < 0 || !this.overlay || !this.stageImage
        ) return

        const detail = reason ? { reason } : undefined
        const dispatchAllowed = this.dispatch('close', {
            cancelable: true,
            detail
        })
        const emitAllowed = this.emit('close', {
            cancelable: true,
            detail
        })
        if (!dispatchAllowed || !emitAllowed) return

        const token = ++this.animationToken
        const active = this.items[this.activeIndex]

        this.overlay.classList.remove(OVERLAY_OPEN_CLASS)

        if (!this.prefersReducedMotion()) {
            this.stageImage.style.transition = this.imageTransition()
            if (active) {
                const targetRect = this.safeRect(this.getRect(active.thumb))
                this.applyRect(this.stageImage, targetRect)
            } else {
                this.stageImage.style.opacity = '0'
            }
            await this.wait(TRANSITION_MS)
            if (token !== this.animationToken) return
        }

        this.overlay.classList.remove(OVERLAY_VISIBLE_CLASS)
        this.overlay.setAttribute('aria-hidden', 'true')
        this.stageImage.style.transition = ''
        this.stageImage.style.opacity = ''
        this.stageImage.removeAttribute('src')

        unlockBodyScrolling(this)
        document.removeEventListener('keydown', this.onDocumentKeydown)
        window.removeEventListener('resize', this.onWindowResize)

        this.isOpen = false
        this.activeIndex = -1
    }

    async showNext ():Promise<void> {
        if (!this.isOpen) return
        await this.showIndex(this.activeIndex + 1)
    }

    async showPrevious ():Promise<void> {
        if (!this.isOpen) return
        await this.showIndex(this.activeIndex - 1)
    }

    private async showIndex (index:number):Promise<void> {
        if (!this.stageImage || !this.isOpen) return
        const normalized = this.normalizeIndex(index)
        if (normalized < 0 || normalized === this.activeIndex) return

        const token = ++this.animationToken
        const item = this.items[normalized]
        if (!item) return

        this.stageImage.style.opacity = '0'
        if (!this.prefersReducedMotion()) {
            await this.wait(120)
        }
        if (token !== this.animationToken) return

        this.activeIndex = normalized
        this.stageImage.src = item.src
        this.stageImage.alt = item.alt

        await this.waitForImageLoad(this.stageImage)
        if (token !== this.animationToken) return

        const width = (this.stageImage.naturalWidth ||
            item.thumb.naturalWidth || item.thumb.width)
        const height = (this.stageImage.naturalHeight ||
            item.thumb.naturalHeight || item.thumb.height)
        const toRect = this.computeTargetRect(width, height)
        this.applyRect(this.stageImage, toRect)

        this.updateCounter()
        this.updateNavigationState()

        this.stageImage.style.opacity = '1'
    }

    private updateCounter ():void {
        if (!this.counter) return
        if (this.activeIndex < 0 || this.items.length === 0) {
            this.counter.textContent = ''
            return
        }

        this.counter.textContent = `${this.activeIndex + 1} / ${this.items.length}`
    }

    private updateNavigationState ():void {
        const hasMultiple = this.items.length > 1

        if (this.prevButton) {
            this.prevButton.hidden = !hasMultiple
            this.prevButton.disabled = !hasMultiple
        }

        if (this.nextButton) {
            this.nextButton.hidden = !hasMultiple
            this.nextButton.disabled = !hasMultiple
        }
    }

    private getItemSrc (thumb:HTMLImageElement):string {
        return thumb.dataset.lightboxSrc || thumb.currentSrc || thumb.src
    }

    private getRect (element:HTMLElement):Rect {
        const rect = element.getBoundingClientRect()
        return {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
        }
    }

    private safeRect (rect:Rect):Rect {
        if (rect.width > 0 && rect.height > 0) {
            return rect
        }

        return {
            top: (window.innerHeight / 2) - 1,
            left: (window.innerWidth / 2) - 1,
            width: 2,
            height: 2
        }
    }

    private computeTargetRect (width:number, height:number):Rect {
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const padding = Math.max(16, Math.min(64, viewportWidth * 0.06))
        const maxWidth = Math.max(64, viewportWidth - (padding * 2))
        const maxHeight = Math.max(64, viewportHeight - (padding * 2))
        const safeWidth = Math.max(width, 1)
        const safeHeight = Math.max(height, 1)
        const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight)
        const targetWidth = safeWidth * scale
        const targetHeight = safeHeight * scale

        return {
            top: (viewportHeight - targetHeight) / 2,
            left: (viewportWidth - targetWidth) / 2,
            width: targetWidth,
            height: targetHeight
        }
    }

    private applyRect (element:HTMLElement, rect:Rect):void {
        element.style.top = `${rect.top}px`
        element.style.left = `${rect.left}px`
        element.style.width = `${rect.width}px`
        element.style.height = `${rect.height}px`
    }

    private imageTransition ():string {
        return [
            `top ${TRANSITION_MS}ms ${TRANSITION_CURVE}`,
            `left ${TRANSITION_MS}ms ${TRANSITION_CURVE}`,
            `width ${TRANSITION_MS}ms ${TRANSITION_CURVE}`,
            `height ${TRANSITION_MS}ms ${TRANSITION_CURVE}`,
            'opacity 140ms ease'
        ].join(', ')
    }

    private prefersReducedMotion ():boolean {
        return Boolean(this.mediaQueryList?.matches)
    }

    private async waitForImageLoad (image:HTMLImageElement):Promise<void> {
        if (image.complete && image.naturalWidth > 0) return

        await new Promise<void>(resolve => {
            const onReady = ():void => {
                image.removeEventListener('load', onReady)
                image.removeEventListener('error', onReady)
                resolve()
            }

            image.addEventListener('load', onReady, { once: true })
            image.addEventListener('error', onReady, { once: true })
        })
    }

    private forceReflow (element:HTMLElement):void {
        // Trigger style/layout so transition starts from the source rect.
        element.offsetWidth
    }

    private async wait (durationMs:number):Promise<void> {
        await new Promise<void>(resolve => {
            window.setTimeout(resolve, durationMs)
        })
    }
}

define('light-box', LightBox)
