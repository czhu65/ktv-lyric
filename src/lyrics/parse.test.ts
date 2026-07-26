import { describe, it, expect } from 'vitest'
import { parseLyricText } from './parse'

describe('parseLyricText', () => {
  it('parses LRC timestamps', () => {
    expect(parseLyricText('[00:12.34]唱歌')).toEqual([{ text: '唱歌', timeMs: 12_340 }])
  })

  it('parses a three-digit millisecond form', () => {
    expect(parseLyricText('[01:02.345]唱')[0].timeMs).toBe(62_345)
  })

  it('accepts plain text with no timestamps', () => {
    expect(parseLyricText('唱歌\n一齊')).toEqual([{ text: '唱歌' }, { text: '一齊' }])
  })

  it('drops blank and whitespace-only lines', () => {
    expect(parseLyricText('唱歌\n\n   \n一齊')).toHaveLength(2)
  })

  it('drops LRC metadata tags', () => {
    expect(parseLyricText('[ar:Someone]\n[00:01.00]唱')).toEqual([
      { text: '唱', timeMs: 1_000 },
    ])
  })

  it('keeps an empty-text timed line out of the result', () => {
    expect(parseLyricText('[00:05.00]')).toEqual([])
  })

  it('normalizes full-width spaces', () => {
    expect(parseLyricText('唱　歌')[0].text).toBe('唱 歌')
  })

  it('emits one entry per stacked timestamp tag, sharing the same text', () => {
    expect(parseLyricText('[00:01.00][00:02.00]唱歌')).toEqual([
      { text: '唱歌', timeMs: 1_000 },
      { text: '唱歌', timeMs: 2_000 },
    ])
  })

  it('strips stacked tags separated by whitespace the same as adjacent ones', () => {
    expect(parseLyricText('[00:01.00] [00:02.00]唱歌')).toEqual([
      { text: '唱歌', timeMs: 1_000 },
      { text: '唱歌', timeMs: 2_000 },
    ])
  })

  it('emits one entry per tag for three stacked timestamps', () => {
    expect(parseLyricText('[00:01.00][00:02.00][00:03.00]唱歌')).toEqual([
      { text: '唱歌', timeMs: 1_000 },
      { text: '唱歌', timeMs: 2_000 },
      { text: '唱歌', timeMs: 3_000 },
    ])
  })

  it('keeps a stacked line with no remaining text out of the result entirely', () => {
    expect(parseLyricText('[00:01.00][00:02.00]')).toEqual([])
  })

  it('keeps ordering sensible when a stacked line sits among ordinary lines', () => {
    expect(
      parseLyricText('[00:00.50]起\n[00:01.00][00:02.00]唱歌\n[00:03.00]完'),
    ).toEqual([
      { text: '起', timeMs: 500 },
      { text: '唱歌', timeMs: 1_000 },
      { text: '唱歌', timeMs: 2_000 },
      { text: '完', timeMs: 3_000 },
    ])
  })
})
