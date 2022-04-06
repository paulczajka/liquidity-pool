// SPDX-License-Identifier: MIT
pragma solidity >=0.8.9;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SpaceCoinToken
 * @author Paul Czajka [paul.czajka@gmail.com]
 * @notice ERC20 SPC token, managed by SpaceTokenIco
 */
contract SpaceCoinToken is ERC20 {
    // When taxing is enabled, treasury takes 2%
    uint8 private constant TAX_PERCENT = 2;
    // Equivalent to 500,000 SPC
    uint80 private constant TOTAL_SUPPLY = 500000000000000000000000;
    // 150,000 SPC is reserved for ICO. Remainder goes to treasury
    uint80 private constant ICO_SUPPLY = 150000000000000000000000;

    // Deployer/owner.  This is the SpaceCoinIco contract
    address private immutable owner;
    // Account that controls taxation and receives tax tokens
    address private immutable treasury;

    // Whether taxing is presently on (true) or off (false)
    bool private taxEnabled = false;

    /// Notifies when taxation has changed.
    /// @param isTaxing Whether taxing is enabled
    event IsTaxed(bool isTaxing);

    /// Notifies when tax has been captured on a transfer
    /// @param value In SPC
    event TaxCaptured(uint80 value);

    /// Constructor
    /// @param _treasury The address that controls taxing and receives tax funds
    constructor(address _treasury) ERC20("Space Coin", "SPC") {
        owner = msg.sender;
        treasury = _treasury;
        // ICO contract gets 150,000 SPC
        _mint(owner, ICO_SUPPLY);
        // Treasury gets 350,000 SPC
        _mint(treasury, TOTAL_SUPPLY - ICO_SUPPLY);
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury, "ONLY_TREASURY");
        _;
    }

    /// Toggle whether transfers are taxed
    /// @param _enabled Whether taxing is enabled (true) or disabled (false)
    function enableTax(bool _enabled) public onlyTreasury {
        taxEnabled = _enabled;
        emit IsTaxed(taxEnabled);
    }

    function currentTaxPercent() external view returns (uint256) {
        return taxEnabled ? TAX_PERCENT : 0;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(amount <= TOTAL_SUPPLY, "INVALID_AMOUNT");

        uint256 tax = 0;

        // Only tax when enabled.
        // Do not tax initial purchases, defined as transfer from owner
        if (taxEnabled && from != owner) {
            // Given check above, we know this cannot overflow
            unchecked {
                tax = (amount * uint256(TAX_PERCENT)) / 100;
            }
            super._transfer(from, treasury, tax);

            emit TaxCaptured(uint80(tax));
        }

        super._transfer(from, to, amount - tax);
    }
}
