// SPDX-License-Identifier: MIT
pragma solidity >=0.8.9;

import "hardhat/console.sol";

import "./SpaceCoinToken.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SpaceCoinPool
 * @author Paul Czajka [paul.czajka@gmail.com]
 * @notice SPC-ETH liquidity pool
 */
contract SpaceCoinPool is ERC20 {
    // Minimum liquidity always in existence, once liquidity is added
    uint256 public constant MIN_LIQUIDITY = 1e3;

    uint256 public spcReserve;
    uint256 public ethReserve;
    SpaceCoinToken private spc;
    // nonReentrant()
    uint8 private lock = 1;

    /// Event upon successful addLiquidity()
    /// @param to Liquidity minted to
    /// @param spcAdded SPC added to the pool
    /// @param ethAdded ETH added to the pool
    event LiquidityAdded(address to, uint256 spcAdded, uint256 ethAdded);

    /// Event upon successful removeLiquidity()
    /// @param to Liquidity burned from
    /// @param spcRemoved SPC removed from the pool
    /// @param ethRemoved ETH removed from the pool
    event LiquidityRemoved(address to, uint256 spcRemoved, uint256 ethRemoved);

    /// Event when reserves are updated
    /// @param spcReserve New SPC reserve value
    /// @param ethReserve New ETH reserve value
    event Reserves(uint256 spcReserve, uint256 ethReserve);

    /// Constructor
    /// @param _spc SpaceCoinToken address
    constructor(address _spc) ERC20("SPC Liquidity Pool", "SPCL") {
        spc = SpaceCoinToken(_spc);
    }

    /// Prevent re-entrancy
    modifier nonReentrant() {
        require(lock == 1, "NO_REENTRY");
        lock = 2;
        _;
        lock = 1;
    }

    /// Get present reserve amounts
    /// @return spcR SPC reserve amount
    /// @return ethR ETH reserve amount
    function getReserves() external view returns (uint256 spcR, uint256 ethR) {
        spcR = spcReserve;
        ethR = ethReserve;
    }

    /// Button up accounting after every material change via swap or liquidity ops
    /// @param spcBalance The new SPC reserve amount
    /// @param ethBalance The new ETH reserve amount
    function _updateReserves(uint256 spcBalance, uint256 ethBalance) internal {
        spcReserve = spcBalance;
        ethReserve = ethBalance;
        emit Reserves(spcReserve, ethReserve);
    }

    // source: https://github.com/Uniswap/v2-core/blob/master/contracts/libraries/Math.sol
    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /// Mint liquidity tokens based on balances of ETH and SPC sent to the Pool
    /// @param _to Address to mint liquidity tokens to
    function mint(address _to) external payable {
        // SPC and ETH are expect to be sent in via Router. Capture new pool balances
        uint256 spcBalance = spc.balanceOf(address(this));
        uint256 ethBalance = address(this).balance;

        // Calculate SPC and ETH amounts sent in
        uint256 spcAdded = spcBalance - spcReserve;
        uint256 ethAdded = ethBalance - ethReserve;

        uint256 liquidity;
        uint256 _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            // Initial liquidity provider has tiny amount of liquidity burned
            liquidity = _sqrt(spcAdded * ethAdded) - MIN_LIQUIDITY;
            /// @dev burning to address(1) because OZ has guard against address(0)
            _mint(address(1), MIN_LIQUIDITY);
        } else {
            // Further liquidity additions grant liquidity proportional to reserves and supply
            uint256 spcLiquidity = (spcAdded * _totalSupply) / spcReserve;
            uint256 ethLiquidity = (ethAdded * _totalSupply) / ethReserve;
            liquidity = spcLiquidity <= ethLiquidity
                ? spcLiquidity
                : ethLiquidity;
        }

        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_ADDED");
        _mint(_to, liquidity);
        emit LiquidityAdded(_to, spcAdded, ethAdded);
        _updateReserves(spcBalance, ethBalance);
    }

    /// Burn liquidity tokens and return corresponding SPC and ETH to the holder
    /// @param _to Address burning liquidity tokens and receiving SPC and ETH divestments
    /// @param _minAmountSPC Revert if SPC out does not meet this threshold. Should account for fees and transfer tax.
    /// @param _minAmountETH Revert if ETH out does not meet this threshold
    function burn(
        address payable _to,
        uint256 _minAmountSPC,
        uint256 _minAmountETH
    ) external nonReentrant {
        // Retrieve present balances prior to the liquidation
        uint256 spcBalance = spc.balanceOf(address(this));
        uint256 ethBalance = address(this).balance;
        uint256 liquidityToBurn = balanceOf(address(this));
        uint256 _totalSupply = totalSupply();

        // Calculate SPC/ETH divestments based on liquidity token holdings, and validate mins
        uint256 spcRemoved = (liquidityToBurn * spcBalance) / _totalSupply;
        uint256 ethRemoved = (liquidityToBurn * ethBalance) / _totalSupply;
        require(
            spcRemoved > 0 && ethRemoved > 0,
            "INSUFFICIENT_LIQUIDITY_REMOVED"
        );
        require(spcRemoved >= _minAmountSPC, "UNMET_SPC");
        require(ethRemoved >= _minAmountETH, "UNMET_ETH");

        // Burn liquidity
        _burn(address(this), liquidityToBurn);

        // Transfer SPC and update pool balance
        spc.transfer(_to, spcRemoved);
        spcBalance = spc.balanceOf(address(this));

        // Transfer ETH and update pool balance
        (bool success, ) = _to.call{value: ethRemoved}("");
        require(success, "REMOVE_ETH_FAILED");
        ethBalance -= ethRemoved;

        emit LiquidityRemoved(_to, spcRemoved, ethRemoved);

        // Button up the accounting
        _updateReserves(spcBalance, ethBalance);
    }

    /// Swap ETH for SPC
    /// @param _spcOut SPC expected out
    /// @param _to Address to receive the SPC
    function swapETHforSPC(uint256 _spcOut, address _to)
        external
        payable
        nonReentrant
    {
        require(_spcOut > 0, "INVALID_SPC_OUT");
        require(_spcOut < spcReserve, "INSUFFICIENT_SPC_RESERVE");

        // These balances reflect the post-swap state
        uint256 ethBalance = address(this).balance;
        uint256 spcBalance = spc.balanceOf(address(this)) - _spcOut;

        // validate constant product, accounting for tax
        require(
            spcBalance * (ethBalance * 100 - msg.value) >=
                spcReserve * ethReserve * 100,
            "INVALID_ETH_IN"
        );

        // Transfer SPC
        spc.transfer(_to, _spcOut);

        _updateReserves(spcBalance, ethBalance);
    }

    /// Swap SPC for ETH
    /// @param _ethOut ETH expected out
    /// @param _to Address to receive the SPC
    function swapSPCforETH(uint256 _ethOut, address payable _to)
        external
        nonReentrant
    {
        require(_ethOut > 0, "INVALID_ETH_OUT");
        require(_ethOut < ethReserve, "INSUFFICIENT_ETH_RESERVE");

        // These balances reflect the post-swap state
        uint256 ethBalance = address(this).balance - _ethOut;
        uint256 spcBalance = spc.balanceOf(address(this));
        uint256 spcAmount = spcBalance - spcReserve;

        // validate against constant product, accounting for tax
        require(
            (spcBalance * 100 - spcAmount) * ethBalance >=
                spcReserve * ethReserve * 100,
            "INVALID_SPC_IN"
        );

        // Transfer ETH
        (bool success, ) = _to.call{value: _ethOut}("");
        require(success, "TRANSFER_ETH_FAILED");

        _updateReserves(spcBalance, ethBalance);
    }

    /// Prevent pool from becoming unusable due to mistaken direct transfers
    function sync() external nonReentrant {
        _updateReserves(spc.balanceOf(address(this)), address(this).balance);
    }
}
