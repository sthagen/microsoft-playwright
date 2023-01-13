import { test, expect } from '@playwright/experimental-ct-solid';
import Button from '@/components/Button';
import DefaultChildren from '@/components/DefaultChildren';

test('execute callback when the button is clicked', async ({ mount }) => {
  const messages: string[] = [];
  const component = await mount(
    <Button
      title="Submit"
      onClick={(data) => {
        messages.push(data);
      }}
    />
  );
  await component.click();
  expect(messages).toEqual(['hello']);
});

test('execute callback when a child node is clicked', async ({ mount }) => {
  let clickFired = false;
  const component = await mount(
    <DefaultChildren>
      <span onClick={() => (clickFired = true)}>Main Content</span>
    </DefaultChildren>
  );
  await component.locator('text=Main Content').click();
  expect(clickFired).toBeTruthy();
});
