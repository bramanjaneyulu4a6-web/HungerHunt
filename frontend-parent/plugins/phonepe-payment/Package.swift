// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    // Capacitor derives this identifier from the npm package name when it
    // writes CapApp-SPM/Package.swift, so the product must match exactly.
    name: "HungerhuntPhonepePayment",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "HungerhuntPhonepePayment", targets: ["PhonePePaymentPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/PhonePe/PhonePePayment.git", exact: "5.4.0")
    ],
    targets: [
        .target(
            name: "PhonePePaymentPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "PhonePePayment", package: "PhonePePayment")
            ],
            path: "ios/Sources/PhonePePaymentPlugin"
        )
    ]
)
