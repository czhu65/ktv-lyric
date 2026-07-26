export default function Credits() {
  return (
    <footer className="credits">
      <p>
        Jyutping readings from <a href="https://github.com/CanCLID/to-jyutping">to-jyutping</a>{' '}
        (BSD-2-Clause), built on <a href="https://github.com/rime/rime-cantonese">rime-cantonese</a>{' '}
        and <a href="https://github.com/lshk-org/jyutping-table">LSHK jyutping-table</a> (CC BY 4.0).
      </p>
      <p>
        Definitions derived from <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict">CC-CEDICT</a>{' '}
        (CC BY-SA 4.0) and <a href="https://cantonese.org/">CC-Canto</a> (© 2015–17 Pleco Inc.,
        CC BY-SA 3.0); CEDICT © 1997–98 Paul Andrew Denisowski. The combined data file is released
        under CC BY-SA 4.0.
      </p>
      <p>
        Pronunciation audio from <a href="https://huggingface.co/datasets/AlienKevin/cantone">AlienKevin/cantone</a>{' '}
        (MIT), amazonHiuJin voice. Lyrics fetched at runtime from{' '}
        <a href="https://lrclib.net/">LRCLIB</a> and never stored by this site.
      </p>
      <p>A free, non-commercial study tool.</p>
    </footer>
  )
}
