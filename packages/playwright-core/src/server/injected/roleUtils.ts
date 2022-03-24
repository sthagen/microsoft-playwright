/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { closestCrossShadow, enclosingShadowRootOrDocument, parentElementOrShadowHost } from './selectorEvaluator';

function hasExplicitAccessibleName(e: Element) {
  return e.hasAttribute('aria-label') || e.hasAttribute('aria-labelledby');
}

// https://www.w3.org/TR/wai-aria-practices/examples/landmarks/HTML5.html
const kAncestorPreventingLandmark = 'article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]';

// https://www.w3.org/TR/wai-aria-1.2/#global_states
const kGlobalAriaAttributes = [
  'aria-atomic',
  'aria-busy',
  'aria-controls',
  'aria-current',
  'aria-describedby',
  'aria-details',
  'aria-disabled',
  'aria-dropeffect',
  'aria-errormessage',
  'aria-flowto',
  'aria-grabbed',
  'aria-haspopup',
  'aria-hidden',
  'aria-invalid',
  'aria-keyshortcuts',
  'aria-label',
  'aria-labelledby',
  'aria-live',
  'aria-owns',
  'aria-relevant',
  'aria-roledescription',
];

function hasGlobalAriaAttribute(e: Element) {
  return kGlobalAriaAttributes.some(a => e.hasAttribute(a));
}

// https://w3c.github.io/html-aam/#html-element-role-mappings
const kImplicitRoleByTagName: { [tagName: string]: (e: Element) => string | null } = {
  'A': (e: Element) => {
    return e.hasAttribute('href') ? 'link' : null;
  },
  'AREA': (e: Element) => {
    return e.hasAttribute('href') ? 'link' : null;
  },
  'ARTICLE': () => 'article',
  'ASIDE': () => 'complementary',
  'BLOCKQUOTE': () => 'blockquote',
  'BUTTON': () => 'button',
  'CAPTION': () => 'caption',
  'CODE': () => 'code',
  'DATALIST': () => 'listbox',
  'DD': () => 'definition',
  'DEL': () => 'deletion',
  'DETAILS': () => 'group',
  'DFN': () => 'term',
  'DIALOG': () => 'dialog',
  'DT': () => 'term',
  'EM': () => 'emphasis',
  'FIELDSET': () => 'group',
  'FIGURE': () => 'figure',
  'FOOTER': (e: Element) => closestCrossShadow(e, kAncestorPreventingLandmark) ? null : 'contentinfo',
  'FORM': (e: Element) => hasExplicitAccessibleName(e) ? 'form' : null,
  'H1': () => 'heading',
  'H2': () => 'heading',
  'H3': () => 'heading',
  'H4': () => 'heading',
  'H5': () => 'heading',
  'H6': () => 'heading',
  'HEADER': (e: Element) => closestCrossShadow(e, kAncestorPreventingLandmark) ? null : 'banner',
  'HR': () => 'separator',
  'HTML': () => 'document',
  'IMG': (e: Element) => e.getAttribute('alt') || hasGlobalAriaAttribute(e) ? 'img' : 'presentation',
  'INPUT': (e: Element) => {
    const type = (e as HTMLInputElement).type.toLowerCase();
    if (type === 'search')
      return e.hasAttribute('list') ? 'combobox' : 'searchbox';
    if (['email', 'tel', 'text', 'url', ''].includes(type))
      return e.hasAttribute('list') ? 'combobox' : 'textbox';
    if (type === 'hidden')
      return '';
    return {
      'button': 'button',
      'checkbox': 'checkbox',
      'image': 'button',
      'number': 'spinbutton',
      'radio': 'radio',
      'range': 'slider',
      'reset': 'button',
      'submit': 'button',
    }[type] || 'textbox';
  },
  'INS': () => 'insertion',
  'LI': () => 'listitem',
  'MAIN': () => 'main',
  'MARK': () => 'mark',
  'MATH': () => 'math',
  'MENU': () => 'list',
  'METER': () => 'meter',
  'NAV': () => 'navigation',
  'OL': () => 'list',
  'OPTGROUP': () => 'group',
  'OPTION': () => 'option',
  'OUTPUT': () => 'status',
  'P': () => 'paragraph',
  'PROGRESS': () => 'progressbar',
  'SECTION': (e: Element) => hasExplicitAccessibleName(e) ? 'region' : null,
  'SELECT': (e: Element) => e.hasAttribute('multiple') || (e as HTMLSelectElement).size > 1 ? 'listbox' : 'combobox',
  'STRONG': () => 'strong',
  'SUB': () => 'subscript',
  'SUP': () => 'superscript',
  'TABLE': () => 'table',
  'TBODY': () => 'rowgroup',
  'TD': (e: Element) => {
    const table = closestCrossShadow(e, 'table');
    const role = table ? getExplicitAriaRole(table) : '';
    return (role === 'grid' || role === 'treegrid') ? 'gridcell' : 'cell';
  },
  'TEXTAREA': () => 'textbox',
  'TFOOT': () => 'rowgroup',
  'TH': (e: Element) => {
    if (e.getAttribute('scope') === 'col')
      return 'columnheader';
    if (e.getAttribute('scope') === 'row')
      return 'rowheader';
    const table = closestCrossShadow(e, 'table');
    const role = table ? getExplicitAriaRole(table) : '';
    return (role === 'grid' || role === 'treegrid') ? 'gridcell' : 'cell';
  },
  'THEAD': () => 'rowgroup',
  'TIME': () => 'time',
  'TR': () => 'row',
  'UL': () => 'list',
};

const kPresentationInheritanceParents: { [tagName: string]: string[] } = {
  'DD': ['DL', 'DIV'],
  'DIV': ['DL'],
  'DT': ['DL', 'DIV'],
  'LI': ['OL', 'UL'],
  'TBODY': ['TABLE'],
  'TD': ['TR'],
  'TFOOT': ['TABLE'],
  'TH': ['TR'],
  'THEAD': ['TABLE'],
  'TR': ['THEAD', 'TBODY', 'TFOOT', 'TABLE'],
};

function getImplicitAriaRole(element: Element): string | null {
  const implicitRole = kImplicitRoleByTagName[element.tagName]?.(element) || '';
  if (!implicitRole)
    return null;
  // Inherit presentation role when required.
  // https://www.w3.org/TR/wai-aria-1.2/#conflict_resolution_presentation_none
  let ancestor: Element | null = element;
  while (ancestor) {
    const parent = parentElementOrShadowHost(ancestor);
    const parents = kPresentationInheritanceParents[ancestor.tagName];
    if (!parents || !parent || !parents.includes(parent.tagName))
      break;
    const parentExplicitRole = getExplicitAriaRole(parent);
    if ((parentExplicitRole === 'none' || parentExplicitRole === 'presentation') && !hasPresentationConflictResolution(parent))
      return parentExplicitRole;
    ancestor = parent;
  }
  return implicitRole;
}

// https://www.w3.org/TR/wai-aria-1.2/#role_definitions
const allRoles = [
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'command',
  'complementary', 'composite', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid',
  'gridcell', 'group', 'heading', 'img', 'input', 'insertion', 'landmark', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'meter', 'menu',
  'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup',
  'range', 'region', 'roletype', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'section', 'sectionhead', 'select', 'separator', 'slider',
  'spinbutton', 'status', 'strong', 'structure', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer',
  'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem', 'widget', 'window'
];
// https://www.w3.org/TR/wai-aria-1.2/#abstract_roles
const abstractRoles = ['command', 'composite', 'input', 'landmark', 'range', 'roletype', 'section', 'sectionhead', 'select', 'structure', 'widget', 'window'];
const validRoles = allRoles.filter(role => !abstractRoles.includes(role));

function getExplicitAriaRole(element: Element): string | null {
  // https://www.w3.org/TR/wai-aria-1.2/#document-handling_author-errors_roles
  const explicitRole = (element.getAttribute('role') || '').trim().split(' ')[0];
  return validRoles.includes(explicitRole) ? explicitRole : null;
}

function hasPresentationConflictResolution(element: Element) {
  // https://www.w3.org/TR/wai-aria-1.2/#conflict_resolution_presentation_none
  // TODO: this should include "|| focusable" check.
  return !hasGlobalAriaAttribute(element);
}

function getAriaRole(element: Element): string | null {
  const explicitRole = getExplicitAriaRole(element);
  if (!explicitRole)
    return getImplicitAriaRole(element);
  if ((explicitRole === 'none' || explicitRole === 'presentation') && hasPresentationConflictResolution(element))
    return getImplicitAriaRole(element);
  return explicitRole;
}

function getAriaBoolean(attr: string | null) {
  return attr === null ? undefined : attr.toLowerCase() === 'true';
}

function getComputedStyle(element: Element, pseudo?: string): CSSStyleDeclaration | undefined {
  return element.ownerDocument && element.ownerDocument.defaultView ? element.ownerDocument.defaultView.getComputedStyle(element, pseudo) : undefined;
}

export function isElementHiddenForAria(element: Element, cache: Map<Element, boolean>): boolean {
  if (['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName))
    return true;

  let style: CSSStyleDeclaration | undefined = getComputedStyle(element);
  if (!style || style.visibility === 'hidden')
    return true;

  let parent: Element | undefined = element;
  while (parent) {
    if (!cache.has(parent)) {
      if (!style)
        style = getComputedStyle(parent);
      const hidden = !style || style.display === 'none' || getAriaBoolean(parent.getAttribute('aria-hidden')) === true;
      cache.set(parent, hidden);
    }
    if (cache.get(parent)!)
      return true;
    parent = parentElementOrShadowHost(parent);
  }
  return false;
}

function getIdRefs(element: Element, ref: string | null): Element[] {
  if (!ref)
    return [];
  const root = enclosingShadowRootOrDocument(element);
  if (!root)
    return [];
  try {
    const ids = ref.split(' ').filter(id => !!id);
    const set = new Set<Element>();
    for (const id of ids) {
      // https://www.w3.org/TR/wai-aria-1.2/#mapping_additional_relations_error_processing
      // "If more than one element has the same ID, the user agent SHOULD use the first element found with the given ID"
      const firstElement = root.querySelector('#' + CSS.escape(id));
      if (firstElement)
        set.add(firstElement);
    }
    return [...set];
  } catch (e) {
    return [];
  }
}

function normalizeAccessbileName(s: string): string {
  // "Flat string" at https://w3c.github.io/accname/#terminology
  return s.replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ').replace(/\s\s+/g, ' ').trim();
}

function queryInAriaOwned(element: Element, selector: string): Element[] {
  const result = [...element.querySelectorAll(selector)];
  for (const owned of getIdRefs(element, element.getAttribute('aria-owns'))) {
    if (owned.matches(selector))
      result.push(owned);
    result.push(...owned.querySelectorAll(selector));
  }
  return result;
}

function getPseudoContent(pseudoStyle: CSSStyleDeclaration | undefined) {
  if (!pseudoStyle)
    return '';
  const content = pseudoStyle.getPropertyValue('content');
  if ((content[0] === '\'' && content[content.length - 1] === '\'') ||
    (content[0] === '"' && content[content.length - 1] === '"')) {
    const unquoted = content.substring(1, content.length - 1);
    // SPEC DIFFERENCE.
    // Spec says "CSS textual content, without a space", but we account for display
    // to pass "name_file-label-inline-block-styles-manual.html"
    const display = pseudoStyle.getPropertyValue('display') || 'inline';
    if (display !== 'inline')
      return ' ' + unquoted + ' ';
    return unquoted;
  }
  return '';
}

export function getElementAccessibleName(element: Element, includeHidden: boolean, hiddenCache: Map<Element, boolean>): string {
  // https://w3c.github.io/accname/#computation-steps

  // step 1.
  // https://w3c.github.io/aria/#namefromprohibited
  const elementProhibitsNaming = ['caption', 'code', 'definition', 'deletion', 'emphasis', 'generic', 'insertion', 'mark', 'paragraph', 'presentation', 'strong', 'subscript', 'suggestion', 'superscript', 'term', 'time'].includes(getAriaRole(element) || '');
  if (elementProhibitsNaming)
    return '';

  // step 2.
  const accessibleName = normalizeAccessbileName(getElementAccessibleNameInternal(element, {
    includeHidden,
    hiddenCache,
    visitedElements: new Set(),
    embeddedInLabelledBy: 'none',
    embeddedInLabel: 'none',
    embeddedInTextAlternativeElement: false,
    embeddedInTargetElement: 'self',
  }));
  return accessibleName;
}

type AccessibleNameOptions = {
  includeHidden: boolean,
  hiddenCache: Map<Element, boolean>,
  visitedElements: Set<Element>,
  embeddedInLabelledBy: 'none' | 'self' | 'descendant',
  embeddedInLabel: 'none' | 'self' | 'descendant',
  embeddedInTextAlternativeElement: boolean,
  embeddedInTargetElement: 'none' | 'self' | 'descendant',
};

function getElementAccessibleNameInternal(element: Element, options: AccessibleNameOptions): string {
  if (options.visitedElements.has(element))
    return '';

  const childOptions: AccessibleNameOptions = {
    ...options,
    embeddedInLabel: options.embeddedInLabel === 'self' ? 'descendant' : options.embeddedInLabel,
    embeddedInLabelledBy: options.embeddedInLabelledBy === 'self' ? 'descendant' : options.embeddedInLabelledBy,
    embeddedInTargetElement: options.embeddedInTargetElement === 'self' ? 'descendant' : options.embeddedInTargetElement,
  };

  // step 2a.
  if (!options.includeHidden && options.embeddedInLabelledBy !== 'self' && isElementHiddenForAria(element, options.hiddenCache)) {
    options.visitedElements.add(element);
    return '';
  }

  // step 2b.
  if (options.embeddedInLabelledBy === 'none') {
    const refs = getIdRefs(element, element.getAttribute('aria-labelledby'));
    const accessibleName = refs.map(ref => getElementAccessibleNameInternal(ref, {
      ...options,
      embeddedInLabelledBy: 'self',
      embeddedInTargetElement: 'none',
      embeddedInLabel: 'none',
      embeddedInTextAlternativeElement: false,
    })).join(' ');
    if (accessibleName)
      return accessibleName;
  }

  const role = getAriaRole(element) || '';

  // step 2c.
  if (options.embeddedInLabel !== 'none' || options.embeddedInLabelledBy !== 'none') {
    const isOwnLabel = [...(element as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)).labels || []].includes(element as any);
    const isOwnLabelledBy = getIdRefs(element, element.getAttribute('aria-labelledby')).includes(element);
    if (!isOwnLabel && !isOwnLabelledBy) {
      if (role === 'textbox') {
        options.visitedElements.add(element);
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
          return (element as HTMLInputElement | HTMLTextAreaElement).value;
        return element.textContent || '';
      }
      if (['combobox', 'listbox'].includes(role)) {
        options.visitedElements.add(element);
        let selectedOptions: Element[];
        if (element.tagName === 'SELECT') {
          selectedOptions = [...(element as HTMLSelectElement).selectedOptions];
          if (!selectedOptions.length && (element as HTMLSelectElement).options.length)
            selectedOptions.push((element as HTMLSelectElement).options[0]);
        } else {
          const listbox = role === 'combobox' ? queryInAriaOwned(element, '*').find(e => getAriaRole(e) === 'listbox') : element;
          selectedOptions = listbox ? queryInAriaOwned(listbox, '[aria-selected="true"]').filter(e => getAriaRole(e) === 'option') : [];
        }
        return selectedOptions.map(option => getElementAccessibleNameInternal(option, childOptions)).join(' ');
      }
      if (['progressbar', 'scrollbar', 'slider', 'spinbutton', 'meter'].includes(role)) {
        options.visitedElements.add(element);
        if (element.hasAttribute('aria-valuetext'))
          return element.getAttribute('aria-valuetext') || '';
        if (element.hasAttribute('aria-valuenow'))
          return element.getAttribute('aria-valuenow') || '';
        return element.getAttribute('value') || '';
      }
      if (['menu'].includes(role)) {
        // https://github.com/w3c/accname/issues/67#issuecomment-553196887
        options.visitedElements.add(element);
        return '';
      }
    }
  }

  // step 2d.
  const ariaLabel = element.getAttribute('aria-label') || '';
  if (ariaLabel.trim()) {
    options.visitedElements.add(element);
    return ariaLabel;
  }

  // step 2e.
  if (!['presentation', 'none'].includes(role)) {
    // https://w3c.github.io/html-aam/#input-type-button-input-type-submit-and-input-type-reset
    if (element.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((element as HTMLInputElement).type)) {
      options.visitedElements.add(element);
      const value = (element as HTMLInputElement).value || '';
      if (value.trim())
        return value;
      if ((element as HTMLInputElement).type === 'submit')
        return 'Submit';
      if ((element as HTMLInputElement).type === 'reset')
        return 'Reset';
      const title = element.getAttribute('title') || '';
      return title;
    }

    // https://w3c.github.io/html-aam/#input-type-image
    if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'image') {
      options.visitedElements.add(element);
      const alt = element.getAttribute('alt') || '';
      if (alt.trim())
        return alt;
      // SPEC DIFFERENCE.
      // Spec does not mention "label" elements, but we account for labels
      // to pass "name_test_case_616-manual.html"
      const labels = (element as HTMLInputElement).labels || [];
      if (labels.length) {
        return [...labels].map(label => getElementAccessibleNameInternal(label, {
          ...options,
          embeddedInLabel: 'self',
          embeddedInTextAlternativeElement: false,
          embeddedInLabelledBy: 'none',
          embeddedInTargetElement: 'none',
        })).filter(accessibleName => !!accessibleName).join(' ');
      }
      const title = element.getAttribute('title') || '';
      if (title.trim())
        return title;
      return 'Submit Query';
    }

    // https://w3c.github.io/html-aam/#input-type-text-input-type-password-input-type-search-input-type-tel-input-type-url-and-textarea-element
    // https://w3c.github.io/html-aam/#other-form-elements
    // For "other form elements", we count select and any other input.
    if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.tagName === 'INPUT') {
      options.visitedElements.add(element);
      const labels = (element as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)).labels || [];
      if (labels.length) {
        return [...labels].map(label => getElementAccessibleNameInternal(label, {
          ...options,
          embeddedInLabel: 'self',
          embeddedInTextAlternativeElement: false,
          embeddedInLabelledBy: 'none',
          embeddedInTargetElement: 'none',
        })).filter(accessibleName => !!accessibleName).join(' ');
      }

      const usePlaceholder = (element.tagName === 'INPUT' && ['text', 'password', 'search', 'tel', 'email', 'url'].includes((element as HTMLInputElement).type)) || element.tagName === 'TEXTAREA';
      const placeholder = element.getAttribute('placeholder') || '';
      const title = element.getAttribute('title') || '';
      if (!usePlaceholder || title)
        return title;
      return placeholder;
    }

    // https://w3c.github.io/html-aam/#fieldset-and-legend-elements
    if (element.tagName === 'FIELDSET') {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (child.tagName === 'LEGEND') {
          return getElementAccessibleNameInternal(child, {
            ...childOptions,
            embeddedInTextAlternativeElement: true,
          });
        }
      }
      const title = element.getAttribute('title') || '';
      return title;
    }

    // https://w3c.github.io/html-aam/#figure-and-figcaption-elements
    if (element.tagName === 'FIGURE') {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (child.tagName === 'FIGCAPTION') {
          return getElementAccessibleNameInternal(child, {
            ...childOptions,
            embeddedInTextAlternativeElement: true,
          });
        }
      }
      const title = element.getAttribute('title') || '';
      return title;
    }

    // https://w3c.github.io/html-aam/#img-element
    if (element.tagName === 'IMG') {
      options.visitedElements.add(element);
      const alt = element.getAttribute('alt') || '';
      if (alt.trim())
        return alt;
      const title = element.getAttribute('title') || '';
      return title;
    }

    // https://w3c.github.io/html-aam/#table-element
    if (element.tagName === 'TABLE') {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (child.tagName === 'CAPTION') {
          return getElementAccessibleNameInternal(child, {
            ...childOptions,
            embeddedInTextAlternativeElement: true,
          });
        }
      }
      // SPEC DIFFERENCE.
      // Spec says "if the table element has a title attribute, then use that attribute".
      // We ignore title to pass "name_from_content-manual.html".
    }

    // https://w3c.github.io/html-aam/#area-element
    if (element.tagName === 'AREA') {
      options.visitedElements.add(element);
      const alt = element.getAttribute('alt') || '';
      if (alt.trim())
        return alt;
      const title = element.getAttribute('title') || '';
      return title;
    }

    // https://www.w3.org/TR/svg-aam-1.0/
    if (element.tagName === 'SVG' && (element as SVGElement).ownerSVGElement) {
      options.visitedElements.add(element);
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (child.tagName === 'TITLE' && (element as SVGElement).ownerSVGElement) {
          return getElementAccessibleNameInternal(child, {
            ...childOptions,
            embeddedInTextAlternativeElement: true,
          });
        }
      }
    }
  }

  // step 2f + step 2h.
  // https://w3c.github.io/aria/#namefromcontent
  const allowsNameFromContent = ['button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem'].includes(role);
  if (allowsNameFromContent || options.embeddedInLabelledBy !== 'none' || options.embeddedInLabel !== 'none' || options.embeddedInTextAlternativeElement || options.embeddedInTargetElement === 'descendant') {
    options.visitedElements.add(element);
    const tokens: string[] = [];
    const visit = (node: Node) => {
      if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
        const display = getComputedStyle(node as Element)?.getPropertyValue('display') || 'inline';
        let token = getElementAccessibleNameInternal(node as Element, childOptions);
        // SPEC DIFFERENCE.
        // Spec says "append the result to the accumulated text", assuming "with space".
        // However, multiple tests insist that inline elements do not add a space.
        // Additionally, <br> insists on a space anyway, see "name_file-label-inline-block-elements-manual.html"
        if (display !== 'inline' || node.nodeName === 'BR')
          token = ' ' + token + ' ';
        tokens.push(token);
      } else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
        // step 2g.
        tokens.push(node.textContent || '');
      }
    };
    tokens.push(getPseudoContent(getComputedStyle(element, '::before')));
    for (let child = element.firstChild; child; child = child.nextSibling)
      visit(child);
    if (element.shadowRoot) {
      for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling)
        visit(child);
    }
    for (const owned of getIdRefs(element, element.getAttribute('aria-owns')))
      visit(owned);
    tokens.push(getPseudoContent(getComputedStyle(element, '::after')));
    const accessibleName = tokens.join('');
    if (accessibleName.trim())
      return accessibleName;
  }

  // step 2i.
  if (!['presentation', 'none'].includes(role) || element.tagName === 'IFRAME') {
    options.visitedElements.add(element);
    const title = element.getAttribute('title') || '';
    if (title.trim())
      return title;
  }

  options.visitedElements.add(element);
  return '';
}
