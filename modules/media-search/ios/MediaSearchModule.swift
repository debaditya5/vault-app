import ExpoModulesCore
import Photos

public class MediaSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MediaSearch")

    // saveToGallery(localUri, mimeType) → Promise<Void>
    AsyncFunction("saveToGallery") {
      (localUri: String, mimeType: String, promise: Promise) in

      guard let url = URL(string: localUri) else {
        promise.reject("ERR_URI", "Invalid URI: \(localUri)")
        return
      }
      let isVideo = mimeType.hasPrefix("video/")
      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        let options = PHAssetResourceCreationOptions()
        options.shouldMoveFile = false
        request.addResource(
          with: isVideo ? .video : .photo,
          fileURL: url,
          options: options
        )
      }) { success, error in
        if success {
          promise.resolve(nil)
        } else {
          promise.reject("ERR_SAVE", error?.localizedDescription ?? "Failed to save to gallery")
        }
      }
    }

    // searchAssets(albumId, query, mediaType, limit) → Promise<[Asset]>
    AsyncFunction("searchAssets") {
      (albumId: String?, query: String, mediaType: String, limit: Int, promise: Promise) in

      // Check auth status
      let status: PHAuthorizationStatus
      if #available(iOS 14, *) {
        status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      } else {
        status = PHPhotoLibrary.authorizationStatus()
      }
      guard status == .authorized || status == .limited else {
        promise.reject("ERR_PERMISSION", "Photo library permission not granted")
        return
      }

      // Run on a background thread so the JS thread is never blocked
      DispatchQueue.global(qos: .userInitiated).async {
        let fetchOptions = PHFetchOptions()
        fetchOptions.includeHiddenAssets = false
        fetchOptions.includeAllBurstAssets = false
        if limit > 0 {
          fetchOptions.fetchLimit = limit
        }
        fetchOptions.sortDescriptors = [
          NSSortDescriptor(key: "creationDate", ascending: false)
        ]

        // Build compound predicate
        var predicates: [NSPredicate] = []

        // Filename filter — [cd] = case-insensitive, diacritic-insensitive
        predicates.append(
          NSPredicate(format: "filename CONTAINS[cd] %@", query)
        )

        // Media type filter
        switch mediaType {
        case "photo":
          predicates.append(
            NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
          )
        case "video":
          predicates.append(
            NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue)
          )
        default:
          predicates.append(
            NSPredicate(
              format: "mediaType == %d OR mediaType == %d",
              PHAssetMediaType.image.rawValue,
              PHAssetMediaType.video.rawValue
            )
          )
        }

        fetchOptions.predicate = NSCompoundPredicate(
          andPredicateWithSubpredicates: predicates
        )

        // Fetch from specific album or globally
        let fetchResult: PHFetchResult<PHAsset>
        if let albumId = albumId, !albumId.isEmpty {
          let collectionFetch = PHAssetCollection.fetchAssetCollections(
            withLocalIdentifiers: [albumId],
            options: nil
          )
          guard let collection = collectionFetch.firstObject else {
            promise.resolve([[String: Any]]())
            return
          }
          fetchResult = PHAsset.fetchAssets(in: collection, options: fetchOptions)
        } else {
          fetchResult = PHAsset.fetchAssets(with: fetchOptions)
        }

        // Convert to plain dictionaries
        var results: [[String: Any]] = []
        results.reserveCapacity(fetchResult.count)

        fetchResult.enumerateObjects { asset, _, _ in
          let duration = asset.mediaType == .video ? asset.duration : 0.0
          // Use the same filename key expo-media-library reads
          let filename = (asset.value(forKey: "filename") as? String) ?? ""
          results.append([
            "id":           asset.localIdentifier,
            "filename":     filename,
            // ph:// URI — same format expo-media-library returns for iOS
            "uri":          "ph://\(asset.localIdentifier)",
            "mediaType":    asset.mediaType == .video ? "video" : "photo",
            "duration":     duration,
            "creationTime": (asset.creationDate?.timeIntervalSince1970 ?? 0) * 1000,
            "width":        asset.pixelWidth,
            "height":       asset.pixelHeight,
          ])
        }

        promise.resolve(results)
      }
    }
  }
}
