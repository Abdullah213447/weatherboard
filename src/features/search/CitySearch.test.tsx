import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanCities } from '@/domain/cities';
import { AppError } from '@/domain/errors';
import { pageFromGeoDb } from '@/test/cities';
import type { CitySearcher, SearchOutcome } from './citySearcher';
import { CitySearch } from './CitySearch';

const lahoCities = cleanCities((await pageFromGeoDb('laho')).candidates);
const londCities = cleanCities((await pageFromGeoDb('lond')).candidates);

type Answer = Partial<SearchOutcome> | AppError;

/** A searcher that answers from a table of query -> recorded results or an error. */
function searcherWith(answers: Record<string, Answer>) {
  const search = vi.fn<CitySearcher['search']>((query) => {
    const answer = answers[query.toLowerCase()] ?? { cities: [] };
    if (answer instanceof AppError) return Promise.reject(answer);
    return Promise.resolve({ query, cities: [], servedBy: 'geodb', origin: 'network', ...answer });
  });
  return { search };
}

function setup(answers: Record<string, Answer> = { laho: { cities: lahoCities } }) {
  const searcher = searcherWith(answers);
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <CitySearch onSelect={onSelect} searcher={searcher} />
      <button type="button">Elsewhere</button>
    </>,
  );
  const input = screen.getByRole('combobox', { name: 'Search for a city' });
  return { user, input, onSelect, searcher };
}

const options = () => screen.findAllByRole('option');
/** The message as the user sees it; the same words are also sent to the live region. */
const visible = async (text: string | RegExp) => {
  const [first] = await screen.findAllByText(text, { selector: 'p' });
  if (!first) throw new Error(`No visible message matching ${String(text)}.`);
  return first;
};
const nth = <T,>(list: T[], index: number): T => {
  const item = list[index];
  if (item === undefined) throw new Error(`Nothing at index ${String(index)}.`);
  return item;
};
const activeOption = (input: HTMLElement) =>
  document.getElementById(input.getAttribute('aria-activedescendant') ?? 'none');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('suggestions', () => {
  it('lists matches with region, country and country code so namesakes can be told apart', async () => {
    const { user, input } = setup({ lond: { cities: londCities } });

    await user.type(input, 'Lond');
    const list = await options();

    expect(list).toHaveLength(6);
    expect(list[0]).toHaveTextContent('London');
    expect(list[0]).toHaveTextContent('England, United Kingdom');
    expect(list[0]).toHaveTextContent('GB');
    expect(list[3]).toHaveTextContent('London');
    expect(list[3]).toHaveTextContent('Ontario, Canada');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
  });

  it('highlights the part of the name that was typed', async () => {
    const { user, input } = setup();

    await user.type(input, 'laho');
    const list = await options();

    expect(within(nth(list, 0)).getByText('Laho').tagName).toBe('MARK');
    expect(within(nth(list, 1)).getByText('Laho').tagName).toBe('MARK');
  });

  it('announces how many cities were found', async () => {
    const { user, input } = setup();

    await user.type(input, 'Laho');
    await options();

    expect(screen.getByRole('status')).toHaveTextContent(
      '5 cities found. Use the up and down arrow keys to choose.',
    );
  });

  it('says so quietly when the backup search served the results', async () => {
    const { user, input } = setup({ lond: { cities: londCities, servedBy: 'open-meteo' } });

    await user.type(input, 'Lond');
    await options();

    expect(screen.getByText(/Showing results from the backup city search/)).toBeVisible();
  });

  it('does not search for a single character', async () => {
    const { user, input, searcher } = setup();

    await user.type(input, 'L');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(searcher.search).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('keyboard', () => {
  it('moves through the options with the arrow keys, wrapping at both ends', async () => {
    const { user, input } = setup();
    await user.type(input, 'Laho');
    await options();
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    expect(activeOption(input)).toHaveTextContent('Lahore');
    expect(activeOption(input)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(activeOption(input)).toHaveTextContent('Grand-Lahou');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOption(input)).toHaveTextContent('Lahouaza');

    await user.keyboard('{ArrowDown}');
    expect(activeOption(input)).toHaveTextContent('Lahore');
    expect(input).toHaveFocus();
  });

  it('starts from the last option when Arrow Up is pressed first', async () => {
    const { user, input } = setup();
    await user.type(input, 'Laho');
    await options();

    await user.keyboard('{ArrowUp}');

    expect(activeOption(input)).toHaveTextContent('Lahouaza');
  });

  it('jumps to the first and last option with Home and End', async () => {
    const { user, input } = setup();
    await user.type(input, 'Laho');
    await options();

    await user.keyboard('{End}');
    expect(activeOption(input)).toHaveTextContent('Lahouaza');

    await user.keyboard('{Home}');
    expect(activeOption(input)).toHaveTextContent('Lahore');
  });

  it('selects the highlighted option with Enter', async () => {
    const { user, input, onSelect } = setup();
    await user.type(input, 'Laho');
    await options();

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(lahoCities[1]);
    expect(input).toHaveValue('Grand-Lahou');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Grand-Lahou, Lagunes District, Ivory Coast selected.',
    );
  });

  it('closes the list with Escape, then clears the field with a second Escape', async () => {
    const { user, input } = setup();
    await user.type(input, 'Laho');
    await options();

    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('Laho');

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('reopens the list with Arrow Down after Escape', async () => {
    const { user, input } = setup();
    await user.type(input, 'Laho');
    await options();
    await user.keyboard('{Escape}');

    await user.keyboard('{ArrowDown}');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(activeOption(input)).toHaveTextContent('Lahore');
  });
});

describe('pointer', () => {
  it('selects the clicked option without a blur validation error flashing', async () => {
    const { user, input, onSelect } = setup();
    await user.type(input, 'Laho');
    const list = await options();

    await user.click(nth(list, 0));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(lahoCities[0]);
    expect(input).toHaveValue('Lahore');
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('clears the text with the clear button and keeps focus in the field', async () => {
    const { user, input } = setup();
    await user.type(input, 'Laho');

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
});

describe('validation', () => {
  it('shows no error when the untouched field is focused and left', async () => {
    const { user, input } = setup();

    await user.click(input);
    await user.tab();

    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Enter a city name')).not.toBeInTheDocument();
  });

  it('on blur: asks for a city name once the user has typed and emptied the field', async () => {
    const { user, input } = setup();

    await user.type(input, 'La{Backspace}{Backspace}');
    await user.tab();

    const message = screen.getByText('Enter a city name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(message.id);
  });

  it('on blur: asks for at least two letters', async () => {
    const { user, input } = setup();

    await user.type(input, 'L');
    await user.tab();

    expect(screen.getByText('Type at least 2 letters')).toBeVisible();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('on submit: asks for a city name even if the field was never touched', async () => {
    const { user, input } = setup();

    await user.click(input);
    await user.keyboard('{Enter}');

    expect(screen.getByText('Enter a city name')).toBeVisible();
    expect(input).toHaveFocus();
  });

  it('on submit: asks for at least two letters', async () => {
    const { user, input, searcher } = setup();

    await user.type(input, 'L{Enter}');

    expect(screen.getByText('Type at least 2 letters')).toBeVisible();
    expect(searcher.search).not.toHaveBeenCalled();
  });

  it('clears the error as soon as the text becomes valid, without waiting for blur', async () => {
    const { user, input } = setup();
    await user.type(input, 'L{Enter}');
    expect(screen.getByText('Type at least 2 letters')).toBeVisible();

    await user.type(input, 'a');

    expect(screen.queryByText('Type at least 2 letters')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('submitting typed text', () => {
  it('selects the top match when Enter is pressed without choosing', async () => {
    const { user, input, onSelect } = setup();

    await user.type(input, 'Laho{Enter}');

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(lahoCities[0]);
    });
    expect(input).toHaveValue('Lahore');
  });

  it('shows the no-results message when nothing matches', async () => {
    const { user, input, onSelect } = setup({});

    await user.type(input, 'Zzqxv{Enter}');

    expect(
      await screen.findByText(
        'No cities match “Zzqxv”. Check the spelling or try a nearby larger city.',
      ),
    ).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('No cities match "Zzqxv".');
  });
});

describe('failure states', () => {
  it('rate limited: says how long to wait and offers a retry that works', async () => {
    const { user, input, searcher } = setup({
      laho: new AppError('rate-limited', 'geodb', { retryAfterMs: 1000 }),
    });

    await user.type(input, 'Laho');

    expect(await visible('Too many requests to city search')).toBeVisible();
    expect(screen.getByText(/Wait 1 second, then try again/)).toBeVisible();

    searcher.search.mockResolvedValueOnce({
      query: 'Laho',
      cities: lahoCities,
      servedBy: 'geodb',
      origin: 'network',
    });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await options()).toHaveLength(5);
  });

  it('service error: names the service and what to do', async () => {
    const { user, input } = setup({ laho: new AppError('provider-down', 'geodb') });

    await user.type(input, 'Laho');

    expect(await visible('City search is having problems')).toBeVisible();
    expect(screen.getByText(/try again shortly/)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('City search is having problems');
  });

  it('a rejected key offers no retry, because retrying cannot help', async () => {
    const { user, input } = setup({ laho: new AppError('auth', 'geodb') });

    await user.type(input, 'Laho');

    expect(await visible(/rejected this app’s access key/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offline: disables the field and says why', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { input } = setup();

    expect(input).toBeDisabled();
    const reason = screen.getByText(/You are offline, so city search is paused/);
    expect(reason).toBeVisible();
    expect(input.getAttribute('aria-describedby')).toContain(reason.id);
  });

  it('offline: comes back when the connection returns', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { input } = setup();

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(input).toBeEnabled();
    });
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
  });

  it('a request that fails as offline shows the offline message, not an error panel', async () => {
    const { user, input } = setup({ laho: new AppError('offline', 'geodb') });

    await user.type(input, 'Laho');

    expect(await screen.findByText(/You are offline, so city search is paused/)).toBeVisible();
  });
});
