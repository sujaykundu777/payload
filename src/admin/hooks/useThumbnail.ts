import { useConfig } from '@payloadcms/config-provider';
import { SanitizedCollectionConfig } from '../../collections/config/types';
import isImage from '../../uploads/isImage';

const absoluteURLPattern = new RegExp('^(?:[a-z]+:)?//', 'i');

const useThumbnail = (collection: SanitizedCollectionConfig, doc: Record<string, unknown>): string | false => {
  const {
    upload: {
      staticURL,
      adminThumbnail,
    },
  } = collection;

  const {
    mimeType,
    sizes,
    filename,
  } = doc;

  const { serverURL } = useConfig();

  if (isImage(mimeType as string)) {
    if (typeof adminThumbnail === 'function') {
      const thumbnailURL = adminThumbnail({ doc });

      if (absoluteURLPattern.test(thumbnailURL)) {
        return thumbnailURL;
      }

      return `${serverURL}${thumbnailURL}`;
    }

    if (sizes?.[adminThumbnail]?.filename) {
      return `${serverURL}${staticURL}/${sizes[adminThumbnail].filename}`;
    }

    return `${serverURL}${staticURL}/${filename}`;
  }

  return false;
};

export default useThumbnail;
