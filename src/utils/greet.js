/**
 * Greets the user by printing a message in the console.
 * @param {string} name - The user's name.
 */
export const greetUser = (name) => {
  // Get the publish date from meta tag
  const publishDateMeta = document.querySelector('meta[name="publish-date"]');
  const publishDate = publishDateMeta ? new Date(publishDateMeta.content) : null;

  console.log(`Hello ${name}!`);
  console.log(
    `This site was last published on ${publishDate?.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    })}.`
  );
};
