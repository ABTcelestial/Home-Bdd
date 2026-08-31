/**
 * Petit rendu Markdown maison (PRD 5.8, mode Apercu).
 *
 * Volontairement sans dependance : l'app doit fonctionner sans internet, et le
 * besoin est limite (titres, listes, tableaux, code, cases a cocher).
 * Tout le HTML source est echappe avant rendu : aucune injection possible
 * depuis un fichier .md depose dans le dossier.
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Lien sur : uniquement http(s) et mailto, sinon on retire le lien. */
function safeUrl(url: string): string | null {
  const clean = url.trim()
  if (/^(https?:\/\/|mailto:|#|\/)/i.test(clean)) return clean
  return null
}

function inline(text: string): string {
  let out = escapeHtml(text)

  // Code inline en premier : son contenu ne doit pas etre re-interprete.
  const codes: string[] = []
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(`<code>${code}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const safe = safeUrl(url)
    return safe ? `<img src="${safe}" alt="${alt}" />` : m
  })
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const safe = safeUrl(url)
    return safe ? `<a href="${safe}" target="_blank" rel="noreferrer noopener">${label}</a>` : m
  })

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)])
  return out
}

const TACHE = /^(\s*)[-*+]\s+\[( |x|X)\]\s?(.*)$/
const PUCE = /^(\s*)[-*+]\s+(.*)$/
const NUMERO = /^(\s*)(\d+)[.)]\s+(.*)$/
const TITRE = /^(#{1,6})\s+(.*)$/
const CITATION = /^>\s?(.*)$/
const TRAIT = /^\s*([-*_])\s*(\1\s*){2,}$/
const TABLEAU_SEP = /^\s*\|?[\s:-]*\|[\s|:-]*$/

/**
 * Rend le Markdown en HTML. Chaque case a cocher porte `data-ligne`, l'index
 * de sa ligne dans le fichier source : c'est ce qui permet de cocher une case
 * depuis l'apercu et de reecrire le bon `- [ ]` sur le disque.
 */
export function renderMarkdown(source: string): string {
  const lines = source.split(/\r?\n/)
  const html: string[] = []
  let i = 0

  const fermerListe = (pile: string[]) => {
    while (pile.length) html.push(`</${pile.pop()}>`)
  }
  const pile: string[] = []

  while (i < lines.length) {
    const ligne = lines[i]

    // Bloc de code
    const fence = /^\s*```(.*)$/.exec(ligne)
    if (fence) {
      fermerListe(pile)
      const contenu: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        contenu.push(lines[i])
        i++
      }
      i++
      html.push(`<pre><code>${escapeHtml(contenu.join('\n'))}</code></pre>`)
      continue
    }

    if (!ligne.trim()) {
      fermerListe(pile)
      i++
      continue
    }

    if (TRAIT.test(ligne)) {
      fermerListe(pile)
      html.push('<hr />')
      i++
      continue
    }

    const titre = TITRE.exec(ligne)
    if (titre) {
      fermerListe(pile)
      const niveau = titre[1].length
      html.push(`<h${niveau}>${inline(titre[2])}</h${niveau}>`)
      i++
      continue
    }

    // Tableau : ligne d'en-tete + ligne de separation
    if (ligne.includes('|') && i + 1 < lines.length && TABLEAU_SEP.test(lines[i + 1])) {
      fermerListe(pile)
      const cellules = (l: string) =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
      const entete = cellules(ligne)
      i += 2
      const corps: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        corps.push(cellules(lines[i]))
        i++
      }
      html.push('<table><thead><tr>')
      for (const c of entete) html.push(`<th>${inline(c)}</th>`)
      html.push('</tr></thead><tbody>')
      for (const rangee of corps) {
        html.push('<tr>')
        for (const c of rangee) html.push(`<td>${inline(c)}</td>`)
        html.push('</tr>')
      }
      html.push('</tbody></table>')
      continue
    }

    const citation = CITATION.exec(ligne)
    if (citation) {
      fermerListe(pile)
      const bloc: string[] = [citation[1]]
      i++
      while (i < lines.length && CITATION.test(lines[i])) {
        bloc.push((CITATION.exec(lines[i]) as RegExpExecArray)[1])
        i++
      }
      html.push(`<blockquote>${inline(bloc.join(' '))}</blockquote>`)
      continue
    }

    const tache = TACHE.exec(ligne)
    if (tache) {
      if (pile[pile.length - 1] !== 'ul') {
        fermerListe(pile)
        html.push('<ul class="taches">')
        pile.push('ul')
      }
      const cochee = tache[2].toLowerCase() === 'x'
      html.push(
        `<li class="${cochee ? 'faite' : ''}">` +
          `<input type="checkbox" data-ligne="${i}"${cochee ? ' checked' : ''} />` +
          `<span>${inline(tache[3])}</span></li>`,
      )
      i++
      continue
    }

    const puce = PUCE.exec(ligne)
    if (puce) {
      if (pile[pile.length - 1] !== 'ul') {
        fermerListe(pile)
        html.push('<ul>')
        pile.push('ul')
      }
      html.push(`<li>${inline(puce[2])}</li>`)
      i++
      continue
    }

    const numero = NUMERO.exec(ligne)
    if (numero) {
      if (pile[pile.length - 1] !== 'ol') {
        fermerListe(pile)
        html.push('<ol>')
        pile.push('ol')
      }
      html.push(`<li>${inline(numero[3])}</li>`)
      i++
      continue
    }

    // Paragraphe : on agrege les lignes suivantes jusqu'a une ligne vide.
    fermerListe(pile)
    const paragraphe: string[] = [ligne]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !TITRE.test(lines[i]) &&
      !PUCE.test(lines[i]) &&
      !NUMERO.test(lines[i]) &&
      !CITATION.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !TRAIT.test(lines[i])
    ) {
      paragraphe.push(lines[i])
      i++
    }
    html.push(`<p>${inline(paragraphe.join('\n')).replace(/\n/g, '<br />')}</p>`)
  }

  fermerListe(pile)
  return html.join('\n')
}

/**
 * Coche / decoche la case de la ligne `index` dans le texte source et renvoie
 * le nouveau contenu (null si la ligne n'est pas une case a cocher).
 */
export function toggleCase(source: string, index: number): string | null {
  const lines = source.split('\n')
  const ligne = lines[index]
  if (ligne === undefined) return null

  // Fichier en CRLF : la ligne se termine par un \r que `.` et `$` ne
  // franchissent pas en JavaScript. Sans ce detachement, la regex ne reconnait
  // plus la case et le clic est ignore en silence — alors que le rendu, lui,
  // decoupe sur /\r?\n/ et affiche bien la case. On le remet a l'identique
  // apres coup : le fichier garde ses fins de ligne d'origine.
  const finDeLigne = ligne.endsWith('\r') ? '\r' : ''
  const nue = finDeLigne ? ligne.slice(0, -1) : ligne

  const match = /^(\s*[-*+]\s+\[)( |x|X)(\].*)$/.exec(nue)
  if (!match) return null
  const coche = match[2].toLowerCase() === 'x'
  lines[index] = `${match[1]}${coche ? ' ' : 'x'}${match[3]}${finDeLigne}`
  return lines.join('\n')
}
