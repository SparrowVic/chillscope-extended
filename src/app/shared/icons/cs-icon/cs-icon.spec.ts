import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CsIcon } from './cs-icon';
import type { CsIconName } from '../icon-roster';

function render(name: CsIconName, size?: '2x'): ComponentFixture<CsIcon> {
  const fixture = TestBed.createComponent(CsIcon);
  fixture.componentRef.setInput('name', name);
  if (size !== undefined) {
    fixture.componentRef.setInput('size', size);
  }
  fixture.detectChanges();
  return fixture;
}

function renderedSvg(fixture: ComponentFixture<CsIcon>): SVGElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('svg');
}

describe('CsIcon', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CsIcon] });
  });

  it('renders the semantic definition as a decorative SVG', () => {
    const svg = renderedSvg(render('bell'));

    expect(svg?.getAttribute('data-icon')).toBe('bell');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reacts when its semantic name changes', () => {
    const fixture = render('bell');

    fixture.componentRef.setInput('name', 'clock');
    fixture.detectChanges();

    expect(renderedSvg(fixture)?.getAttribute('data-icon')).toBe('clock');
  });

  it('forwards the requested Font Awesome size', () => {
    const svg = renderedSvg(render('check', '2x'));

    expect(svg?.classList.contains('fa-2x')).toBe(true);
  });
});
