'use client'
/* Dhun — Pro upsell sheet (Day 52) + unlock flows UI (Day 53).
 *
 * One honest surface for every gated feature. Tapping a Pro control opens
 * this sheet with the specific feature highlighted. The sheet offers:
 *   • Instant activation — free, one tap (the tier is free-for-now).
 *   • Loyalty unlock — after 25 plays across 3+ days the app mints a
 *     personal code; paste it once and Pro unlocks.
 *   • Feedback unlock — send feedback, get a thank-you code instantly.
 *   • Code entry — verify any DHUN-XXXXX-XXXXXX code offline.
 * No payment exists anywhere in the app — the copy says so plainly.
 */
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { CheckCircle2, Crown, Loader2, MessageSquareHeart, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { PRO_FEATURES, type ProFeatureId } from '@/lib/premium'
import {
  LOYALTY_PLAYS,
  LOYALTY_DAYS,
  loyaltyStatus,
  useUsageStats,
} from '@/lib/usage-stats'
import {
  mintFeedbackCode,
  mintLoyaltyCode,
  recordFeedbackSent,
  verifyUnlockCode,
} from '@/lib/pro-unlock'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'

/** Tiny global store so ANY gated control can open the sheet. */
interface ProSheetState {
  open: boolean
  feature: ProFeatureId | null
  openSheet: (feature?: ProFeatureId) => void
  closeSheet: () => void
}

export const useProSheet = create<ProSheetState>((set) => ({
  open: false,
  feature: null,
  openSheet: (feature) => set({ open: true, feature: feature ?? null }),
  closeSheet: () => set({ open: false, feature: null }),
}))

/**
 * Outer shell: reads the global store and mounts the content INSIDE the
 * Radix Dialog, which unmounts on close — so every form state (code input,
 * loyalty code, feedback text) resets naturally without reset effects.
 */
export function ProSheet() {
  const open = useProSheet((s) => s.open)
  const feature = useProSheet((s) => s.feature)
  const closeSheet = useProSheet((s) => s.closeSheet)
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? closeSheet() : null)}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <ProSheetContent feature={feature} />
      </DialogContent>
    </Dialog>
  )
}

function ProSheetContent({ feature }: { feature: ProFeatureId | null }) {
  const t = useT()
  const closeSheet = useProSheet((s) => s.closeSheet)
  const premium = useSettings((s) => s.premium)
  const activatePro = useSettings((s) => s.activatePro)
  const stats = useUsageStats()
  const [codeInput, setCodeInput] = useState('')
  const [codeState, setCodeState] = useState<'idle' | 'checking' | 'bad-format' | 'bad-checksum'>('idle')
  const [loyaltyCode, setLoyaltyCode] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  const loyalty = useMemo(() => loyaltyStatus(stats ?? undefined), [stats])
  const activeFeature = PRO_FEATURES.find((f) => f.id === feature)

  function activate(via: 'instant' | 'loyalty' | 'feedback' | 'code') {
    activatePro(via)
    toast.success(t('Dhun Pro is on'), {
      description: t('Everything stays free — Pro adds comfort. Thank you for supporting Dhun.'),
    })
    closeSheet()
  }

  function checkCode() {
    if (!codeInput.trim()) return
    setCodeState('checking')
    const res = verifyUnlockCode(codeInput)
    if (!res.ok) {
      setCodeState(res.reason === 'format' ? 'bad-format' : 'bad-checksum')
      return
    }
    activate('code')
  }

  function sendFeedback() {
    const text = feedbackText.trim()
    if (!text) return
    recordFeedbackSent(text)
    setFeedbackSent(true)
    toast.success(t('Feedback saved locally'), {
      description: t('Dhun has no servers for feedback — your note stays on this device. Thank you!'),
    })
    // The thank-you unlock is immediate but non-destructive: it keeps the
    // sheet open so the user sees what just happened.
    activatePro('feedback')
    toast.success(t('Dhun Pro is on'), { description: t('A thank-you for helping Dhun improve.') })
    setLoyaltyCode(mintFeedbackCode())
  }

  return (
    <div className="dhun-scrollbar max-h-[82vh] overflow-y-auto">
          {/* Crown hero */}
          <div className="relative bg-gradient-to-br from-[oklch(0.88_0.13_95)] via-[oklch(0.78_0.15_85)] to-[oklch(0.6_0.12_60)] p-[1.5px]">
            <div className="rounded-t-[calc(var(--radius-lg)-1px)] bg-card px-5 pb-4 pt-5">
              <DialogHeader className="items-start text-left">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="dhun-shimmer flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.88_0.13_95)] to-[oklch(0.64_0.13_70)] shadow-md shadow-amber-500/25"
                    aria-hidden
                  >
                    <Crown className="h-6 w-6 fill-current text-[oklch(0.42_0.09_65)]" />
                  </span>
                  <DialogTitle className="text-lg font-extrabold">
                    {t('Dhun Pro')}
                  </DialogTitle>
                </div>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                {activeFeature
                  ? t('{0} is part of Dhun Pro.', [activeFeature.name])
                  : t('Comfort features that keep Dhun beautiful — while every core thing stays free.')}
              </p>
              {!premium && (
                <Button
                  onClick={() => activate('instant')}
                  className="dhun-shimmer mt-3 w-full gap-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 font-semibold text-amber-950 shadow-md shadow-amber-500/25 hover:from-amber-300 hover:to-yellow-400"
                >
                  <Crown className="h-4 w-4 fill-current" /> {t('Activate Pro — free')}
                </Button>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                {t('No payment exists in Dhun. Core playback, search, playlists, lyrics and downloads are free forever.')}
              </p>
            </div>
          </div>

          {premium ? (
            <div className="px-5 py-4 text-center text-sm text-muted-foreground">
              <span className="dhun-shimmer inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-1.5 text-xs font-bold text-amber-950">
                <Crown className="h-3.5 w-3.5 fill-current" /> {t('Pro is already active')}
              </span>
            </div>
          ) : (
            <div className="space-y-4 px-5 py-4">
              {/* Pro feature catalog */}
              <section aria-label={t('What Pro adds')}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('What Pro adds')}
                </h3>
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <li
                      key={f.id}
                      className={cn(
                        'rounded-xl border p-2.5 text-xs',
                        f.id === feature && 'border-primary/60 bg-primary/5'
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Sparkles className="h-3 w-3 text-primary" aria-hidden /> {f.name}
                        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          {f.location}
                        </span>
                      </div>
                      <p className="mt-1 leading-snug text-muted-foreground">{f.blurb}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Loyalty unlock */}
              <section
                aria-label={t('Unlock by loyalty')}
                className="rounded-xl border bg-muted/30 p-3"
              >
                <h3 className="text-xs font-semibold">{t('Unlock by loyalty')}</h3>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {t('Listen to {0} tracks across {1}+ days and Dhun mints a personal unlock code for you.', [
                    String(LOYALTY_PLAYS),
                    String(LOYALTY_DAYS),
                  ])}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{t('Plays')}</span>
                      <span>
                        {loyalty.plays}/{LOYALTY_PLAYS}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all"
                        style={{ width: `${loyalty.playsPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{t('Active days')}</span>
                      <span>
                        {loyalty.days}/{LOYALTY_DAYS}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all"
                        style={{ width: `${loyalty.daysPct}%` }}
                      />
                    </div>
                  </div>
                </div>
                {loyalty.earned && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full rounded-full gap-1.5"
                    onClick={() => setLoyaltyCode(mintLoyaltyCode())}
                  >
                    <Crown className="h-3.5 w-3.5" />
                    {loyaltyCode ? t('My unlock code') : t('Mint my loyalty code')}
                  </Button>
                )}
                {loyaltyCode && (
                  <div className="mt-2 rounded-lg border border-dashed bg-background p-2 text-center">
                    <code className="select-all text-sm font-bold tracking-wider">{loyaltyCode}</code>
                    <div className="mt-1.5 flex justify-center gap-2">
                      <Button size="sm" className="h-7 rounded-full" onClick={() => activate('loyalty')}>
                        {t('Use this code')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full"
                        onClick={() => {
                          navigator.clipboard?.writeText(loyaltyCode).then(
                            () => toast(t('Code copied')),
                            () => {}
                          )
                        }}
                      >
                        {t('Copy')}
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              {/* Feedback unlock */}
              <section aria-label={t('Unlock by feedback')} className="rounded-xl border bg-muted/30 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                  <MessageSquareHeart className="h-3.5 w-3.5 text-primary" aria-hidden /> {t('Unlock by feedback')}
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {t('Tell us what you love or what to fix — feedback unlocks Pro as a thank-you.')}
                </p>
                {feedbackSent ? (
                  <p className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                    {t('Thank you! Pro unlocked — your feedback stays on this device.')}
                  </p>
                ) : (
                  <>
                    <Textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder={t('What do you love? What should we fix?')}
                      className="mt-2 min-h-[60px] resize-none text-xs"
                      aria-label={t('Your feedback')}
                    />
                    <Button
                      size="sm"
                      className="mt-2 w-full rounded-full gap-1.5"
                      disabled={!feedbackText.trim()}
                      onClick={sendFeedback}
                    >
                      <MessageSquareHeart className="h-3.5 w-3.5" /> {t('Send feedback & unlock')}
                    </Button>
                  </>
                )}
              </section>

              {/* Code entry */}
              <section aria-label={t('Have an unlock code?')} className="rounded-xl border p-3">
                <h3 className="text-xs font-semibold">{t('Have an unlock code?')}</h3>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={codeInput}
                    onChange={(e) => {
                      setCodeInput(e.target.value)
                      setCodeState('idle')
                    }}
                    placeholder="DHUN-XXXXX-XXXXXX"
                    className="font-mono text-xs uppercase"
                    aria-label={t('Unlock code')}
                    onKeyDown={(e) => e.key === 'Enter' && checkCode()}
                  />
                  <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={checkCode}>
                    {codeState === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('Verify')}
                  </Button>
                </div>
                {codeState === 'bad-format' && (
                  <p className="mt-1.5 text-[11px] text-destructive">{t('Codes look like DHUN-XXXXX-XXXXXX.')}</p>
                )}
                {codeState === 'bad-checksum' && (
                  <p className="mt-1.5 text-[11px] text-destructive">{t('That code does not verify — check the characters.')}</p>
                )}
              </section>
            </div>
          )}
    </div>
  )
}
